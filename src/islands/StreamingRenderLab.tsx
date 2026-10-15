/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

/**
 * LLM 스트리밍 답변 렌더 비교.
 *
 * 같은 가짜 SSE 스트림(텍스트 → 도구 호출 대기 → 차트 블록 → 텍스트)을 두 말풍선에
 * 동시에 흘려보낸다.
 *   - 왼쪽: 흔한 첫 구현 — 조각이 올 때마다 렌더, 말풍선 전체 페이드, 반쪽 JSON 도
 *           차트 렌더러에 그대로 넘김, 멈춘 구간 표시 없음
 *   - 오른쪽: 기법 네 가지를 하나씩 켜고 끌 수 있음
 *
 * 실제 LLM·마크다운 라이브러리 없이, 렌더 방식의 차이만 재현한 시뮬레이션이다.
 * 렌더 횟수와 "반쪽 차트가 실패 화면으로 보인 횟수"를 말풍선마다 센다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 스트림
// ─────────────────────────────────────────────────────────────────────────────

type Step = { kind: "text"; value: string } | { kind: "pause"; ms: number };

const CHART_JSON =
  '{"title":"지역별 충전기 수","data":[["서울",412],["경기",356],["부산",188],["대구",121],["광주",97]]}';

const SCRIPT: Step[] = [
  {
    kind: "text",
    value:
      "## 지역별 충전기 현황\n서울이 가장 많고 경기와 부산이 뒤를 잇습니다. 최근 석 달 동안 새로 설치된 충전기의 절반 가까이가 수도권에 몰렸어요.\n",
  },
  // 모델이 도구를 부르는 구간 — 델타가 한동안 끊긴다
  { kind: "pause", ms: 1600 },
  { kind: "text", value: "```chart\n" + CHART_JSON + "\n```\n" },
  {
    kind: "text",
    value:
      "부산은 충전기 수에 비해 고장 접수가 많은 편이라, 다음으로 고장 이력을 같이 보시는 걸 추천드려요.",
  },
];

/** 매번 같은 조각으로 쪼개지도록 시드 고정 난수 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Event = { chunk: string } | { pause: number };

function buildEvents(withPause: boolean): Event[] {
  const rand = seeded(7);
  const events: Event[] = [];
  for (const step of SCRIPT) {
    if (step.kind === "pause") {
      if (withPause) events.push({ pause: step.ms });
      continue;
    }
    // 토큰처럼 1~4글자씩 쪼갠다
    let i = 0;
    const chars = Array.from(step.value);
    while (i < chars.length) {
      const n = 1 + Math.floor(rand() * 4);
      events.push({ chunk: chars.slice(i, i + n).join("") });
      i += n;
    }
  }
  return events;
}

type Feed = { text: string; done: boolean; paused: boolean };
type Sub = (f: Feed) => void;

// ─────────────────────────────────────────────────────────────────────────────
// 답변 파싱 — 텍스트와 ```chart 블록을 나눈다
// ─────────────────────────────────────────────────────────────────────────────

// 닫는 ``` 가 없어도 문자열 끝까지 블록으로 잡는다. m[3] 이 "```" 면 닫힌 블록.
const BLOCK_RE = /```(chart)[^\n]*\n([\s\S]*?)(```|$)/g;

type Part =
  | { kind: "text"; value: string }
  | { kind: "chart"; body: string; closed: boolean };

function splitParts(content: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    if (m.index > last)
      parts.push({ kind: "text", value: content.slice(last, m.index) });
    parts.push({ kind: "chart", body: m[2], closed: m[3] === "```" });
    last = BLOCK_RE.lastIndex;
    if (m[0].length === 0) BLOCK_RE.lastIndex++;
  }
  if (last < content.length)
    parts.push({ kind: "text", value: content.slice(last) });
  return parts;
}

type ChartSpec = { title: string; data: [string, number][] };

function parseChart(body: string): ChartSpec | null {
  try {
    const v = JSON.parse(body) as ChartSpec;
    return Array.isArray(v.data) ? v : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 글자 단위 페이드인 — 글자 위치마다 등장 지연을 "한 번만" 정해 둔다
// ─────────────────────────────────────────────────────────────────────────────

const STEP_MS = 14;
const MAX_DELAY_MS = 360;

type Ledger = { delays: number[] };

/**
 * 렌더 한 번 동안 쓰는 토큰화기. 문서 순서대로 글자 번호(i)를 매기고,
 * 처음 보는 번호에만 지연을 정해 장부에 적는다. 이미 적힌 번호는 같은 값을 다시
 * 쓰므로, 이미 뜬 글자의 span 은 같은 props 로 렌더되고 DOM 이 바뀌지 않는다.
 */
function makeTokenizer(ledger: Ledger) {
  let idx = 0;
  let base = -1;
  return (text: string) =>
    Array.from(text).map(ch => {
      const i = idx++;
      if (ledger.delays[i] === undefined) {
        if (base < 0) base = i;
        ledger.delays[i] = Math.min((i - base) * STEP_MS, MAX_DELAY_MS);
      }
      return (
        <span
          key={i}
          class="srl-tok"
          style={`animation-delay:${ledger.delays[i]}ms`}
        >
          {ch}
        </span>
      );
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 조각들
// ─────────────────────────────────────────────────────────────────────────────

function TextPart({
  value,
  tokenize,
}: {
  value: string;
  tokenize?: (t: string) => JSX.Element[];
}) {
  const lines = value.split("\n").filter(l => l.length > 0);
  return (
    <>
      {lines.map((line, i) => {
        const heading = line.startsWith("## ");
        const body = heading ? line.slice(3) : line;
        const content = tokenize ? tokenize(body) : body;
        return heading ? (
          <p key={i} class="mb-1.5 text-[14px] font-semibold text-foreground">
            {content}
          </p>
        ) : (
          <p key={i} class="mb-2 text-[13px] leading-relaxed text-foreground">
            {content}
          </p>
        );
      })}
    </>
  );
}

function BarChart({ spec }: { spec: ChartSpec }) {
  const max = Math.max(...spec.data.map(d => d[1]));
  return (
    <div class="my-2 rounded-lg border border-border bg-background/40 p-3">
      <p class="mb-2 text-[12px] font-semibold text-foreground">{spec.title}</p>
      <div class="flex flex-col gap-1.5">
        {spec.data.map(([label, v]) => (
          <div key={label} class="flex items-center gap-2 text-[11px]">
            <span class="w-8 shrink-0 text-foreground-muted">{label}</span>
            <span
              class="h-3 rounded-sm bg-accent"
              style={`width:${(v / max) * 100}%`}
            />
            <span class="font-app text-foreground-muted">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartFallback({ body }: { body: string }) {
  return (
    <div class="my-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
      <p class="mb-1 text-[11px] font-semibold text-red-400">
        차트를 그릴 수 없습니다 (JSON 파싱 실패)
      </p>
      <pre class="max-h-16 overflow-hidden font-app text-[10px] break-all whitespace-pre-wrap text-foreground-muted">
        {body}
      </pre>
    </div>
  );
}

function ChartPending() {
  return (
    <div class="my-2 rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px]">
      <span class="srl-shimmer">차트 그리는 중…</span>
    </div>
  );
}

function StreamDots() {
  return (
    <span class="srl-dots" role="status" aria-label="응답을 기다리는 중">
      <span aria-hidden="true">.</span>
      <span aria-hidden="true">.</span>
      <span aria-hidden="true">.</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 말풍선
// ─────────────────────────────────────────────────────────────────────────────

type Options = {
  coalesce: boolean;
  reveal: boolean;
  pending: boolean;
  dots: boolean;
};

const NAIVE: Options = {
  coalesce: false,
  reveal: false,
  pending: false,
  dots: false,
};

type Counts = { renders: number; fallbacks: number };

function Bubble({
  title,
  hint,
  tone,
  options,
  subscribe,
  bubbleFade,
}: {
  title: string;
  hint: string;
  tone: "muted" | "accent";
  options: Options;
  subscribe: (fn: Sub) => () => void;
  /** 말풍선 전체에 페이드를 거는 흔한 방식 (왼쪽 전용) */
  bubbleFade: boolean;
}) {
  const [feed, setFeed] = useState<Feed>({
    text: "",
    done: false,
    paused: false,
  });
  const counts = useRef<Counts>({ renders: 0, fallbacks: 0 }).current;
  const ledger = useRef<Ledger>({ delays: [] }).current;
  const latest = useRef<Feed>(feed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    const flush = () => {
      timer.current = null;
      setFeed(latest.current);
    };
    const off = subscribe(f => {
      const prev = latest.current;
      latest.current = f;
      // 확정 시점(종료, 대기 시작·끝, 첫 글자)은 기다리지 않고 바로 그린다
      const settled =
        f.done || f.paused !== prev.paused || prev.text.length === 0;
      if (!opts.current.coalesce || settled) {
        if (timer.current) clearTimeout(timer.current);
        flush();
      } else if (timer.current == null) {
        timer.current = setTimeout(flush, 50);
      }
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [subscribe]);

  // 새 feed 로 그려질 때만 센다 — 재생이 끝난 뒤 옵션을 바꿔 다시 그려지는 건 빼고
  const counted = useRef<Feed | null>(null);
  const fresh = counted.current !== feed && feed.text.length > 0;
  if (fresh) {
    counted.current = feed;
    counts.renders += 1;
  }

  const streaming = feed.text.length > 0 && !feed.done;
  const tokenize =
    options.reveal && streaming ? makeTokenizer(ledger) : undefined;

  const parts = splitParts(feed.text).map((p, i) => {
    if (p.kind === "text")
      return <TextPart key={`t${i}`} value={p.value} tokenize={tokenize} />;
    if (!p.closed && options.pending) return <ChartPending key={`c${i}`} />;
    const spec = parseChart(p.body);
    if (!spec) {
      if (fresh) counts.fallbacks += 1;
      return <ChartFallback key={`c${i}`} body={p.body} />;
    }
    return <BarChart key={`c${i}`} spec={spec} />;
  });

  return (
    <div class="flex flex-col gap-3 rounded-2xl p-5 glass">
      <div class="flex items-baseline justify-between gap-3">
        <span
          class={`text-sm font-semibold ${tone === "accent" ? "text-accent" : "text-foreground"}`}
        >
          {title}
        </span>
        <span class="text-right text-[11px] text-foreground-muted">{hint}</span>
      </div>

      <div class="min-h-[260px] rounded-xl bg-background-elevated/60 p-4">
        {feed.text.length === 0 ? (
          <span class="srl-shimmer text-[13px]">생각 중…</span>
        ) : (
          <div
            // 말풍선 전체 페이드: 렌더마다 key 가 바뀌어 애니메이션이 처음부터 다시 돈다
            key={bubbleFade ? counts.renders : "stable"}
            class={bubbleFade && streaming ? "srl-bubble-fade" : ""}
          >
            {parts}
            {options.dots && streaming && <StreamDots />}
          </div>
        )}
      </div>

      <dl class="grid grid-cols-2 gap-2 text-[11px]">
        <div class="rounded-lg bg-background/40 px-3 py-2">
          <dt class="text-foreground-muted">렌더(= 마크다운 파싱) 횟수</dt>
          <dd
            class={`font-app text-lg ${tone === "accent" ? "text-accent" : "text-foreground"}`}
          >
            {counts.renders}회
          </dd>
        </div>
        <div class="rounded-lg bg-background/40 px-3 py-2">
          <dt class="text-foreground-muted">
            반쪽 차트가 실패 화면으로 보인 렌더
          </dt>
          <dd
            class={`font-app text-lg ${counts.fallbacks > 0 ? "text-red-400" : "text-foreground"}`}
          >
            {counts.fallbacks}회
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────

const TOGGLES: { key: keyof Options; label: string; desc: string }[] = [
  {
    key: "coalesce",
    label: "50ms 단위로 모아서 렌더",
    desc: "조각마다 그리지 않고 50ms 안에 온 조각을 한 번에 그립니다. 종료·대기 시작 같은 확정 시점은 바로 그려요.",
  },
  {
    key: "reveal",
    label: "새로 도착한 글자만 페이드인",
    desc: "글자 위치마다 등장 지연을 한 번만 정해 둡니다. 이미 뜬 글자는 같은 props로 렌더돼 다시 깜빡이지 않아요.",
  },
  {
    key: "pending",
    label: "닫히지 않은 블록은 자리표시자",
    desc: "닫는 ``` 가 오기 전에는 차트 렌더러에 넘기지 않습니다. 반쪽 JSON이 실패 화면으로 번쩍이지 않아요.",
  },
  {
    key: "dots",
    label: "멈춘 구간에 점 세 개",
    desc: "도구 호출로 글자가 끊긴 동안에도 아직 진행 중이라는 걸 보여줍니다. 폭은 고정하고 투명도만 바꿔요.",
  },
];

export default function StreamingRenderLab() {
  const [options, setOptions] = useState<Options>({
    coalesce: true,
    reveal: true,
    pending: true,
    dots: true,
  });
  const [speed, setSpeed] = useState(40); // 초당 조각 수
  const [withPause, setWithPause] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [running, setRunning] = useState(false);

  const subs = useRef(new Set<Sub>()).current;
  const subscribe = useRef((fn: Sub) => {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }).current;

  useEffect(() => {
    if (epoch === 0) return;
    const events = buildEvents(withPause);
    let text = "";
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const emit = (f: Feed) => subs.forEach(fn => fn(f));
    setRunning(true);

    const tick = () => {
      if (i >= events.length) {
        emit({ text, done: true, paused: false });
        setRunning(false);
        return;
      }
      const ev = events[i++];
      if ("pause" in ev) {
        emit({ text, done: false, paused: true });
        t = setTimeout(() => {
          emit({ text, done: false, paused: false });
          tick();
        }, ev.pause);
        return;
      }
      text += ev.chunk;
      emit({ text, done: false, paused: false });
      t = setTimeout(tick, 1000 / speed);
    };
    // 말풍선이 새로 마운트되어 구독을 마친 뒤 시작
    t = setTimeout(tick, 300);
    return () => clearTimeout(t);
    // 재생 중 설정 변경은 다음 재생부터 반영 — epoch 가 바뀔 때만 다시 돈다
  }, [epoch]);

  const play = () => setEpoch(e => e + 1);

  return (
    <div class="flex flex-col gap-8 py-6">
      <style>{`
        .srl-tok { animation: srl-in 700ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        @keyframes srl-in { from { opacity: 0; } to { opacity: 1; } }
        .srl-bubble-fade { animation: srl-bubble 320ms ease-out; }
        @keyframes srl-bubble { from { opacity: 0.25; } to { opacity: 1; } }
        .srl-shimmer {
          background: linear-gradient(90deg, var(--foreground-muted, #888) 40%, var(--foreground, #fff) 50%, var(--foreground-muted, #888) 60%);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: srl-sweep 1.5s linear infinite;
        }
        @keyframes srl-sweep { from { background-position: 100% 0; } to { background-position: 0% 0; } }
        .srl-dots { display: inline-block; font-weight: 700; letter-spacing: 0.14em; line-height: 1; }
        .srl-dots > span:nth-child(2) { animation: srl-dot2 1.2s steps(1, end) infinite; }
        .srl-dots > span:nth-child(3) { animation: srl-dot3 1.2s steps(1, end) infinite; }
        @keyframes srl-dot2 { 0% { opacity: 0; } 33.33% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes srl-dot3 { 0% { opacity: 0; } 66.66% { opacity: 1; } 100% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .srl-tok, .srl-bubble-fade, .srl-shimmer { animation: none; }
          .srl-shimmer { color: inherit; background: none; }
          .srl-dots > span { animation: none; opacity: 1; }
        }
      `}</style>

      <header class="flex flex-col gap-2">
        <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
          streaming render
        </p>
        <h2 class="text-xl font-semibold text-foreground sm:text-2xl">
          LLM 답변이 조각으로 올 때, 화면은 어떻게 그려야 할까
        </h2>
        <p class="text-sm leading-relaxed text-foreground-muted">
          같은 스트림을 두 말풍선에 동시에 흘립니다. 중간에 모델이 도구를 부르는
          구간(약 1.6초)과, JSON이 반쯤 온 차트 블록이 들어 있어요. 오른쪽
          기법을 하나씩 끄면서 무엇이 달라지는지 보세요.
        </p>
      </header>

      <section class="flex flex-col gap-4 rounded-2xl p-5 glass">
        <div class="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={play}
            disabled={running}
            class="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
          >
            {epoch === 0 ? "스트림 재생" : running ? "재생 중…" : "다시 재생"}
          </button>
          <label class="flex items-center gap-2 text-[12px] text-foreground-muted">
            속도
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={speed}
              disabled={running}
              onInput={e =>
                setSpeed(Number((e.target as HTMLInputElement).value))
              }
            />
            <span class="w-20 font-app text-foreground">초당 {speed}조각</span>
          </label>
          <label class="flex items-center gap-2 text-[12px] text-foreground-muted">
            <input
              type="checkbox"
              checked={withPause}
              disabled={running}
              onChange={e =>
                setWithPause((e.target as HTMLInputElement).checked)
              }
            />
            도구 호출 대기 넣기
          </label>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map(t => (
            <label
              key={t.key}
              class="flex cursor-pointer gap-3 rounded-xl bg-background/40 p-3"
            >
              <input
                type="checkbox"
                class="mt-0.5"
                checked={options[t.key]}
                disabled={running}
                onChange={e =>
                  setOptions(o => ({
                    ...o,
                    [t.key]: (e.target as HTMLInputElement).checked,
                  }))
                }
              />
              <span class="flex flex-col gap-1">
                <span class="text-[13px] font-semibold text-foreground">
                  {t.label}
                </span>
                <span class="text-[11.5px] leading-relaxed text-foreground-muted">
                  {t.desc}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p class="text-[11px] text-foreground-muted">
          설정은 재생 중에는 잠기고, 다음 재생부터 반영됩니다.
        </p>
      </section>

      <section class="grid gap-5 lg:grid-cols-2">
        <Bubble
          key={`naive-${epoch}`}
          title="흔한 첫 구현"
          hint="조각마다 렌더 · 말풍선 전체 페이드 · 반쪽 JSON 그대로"
          tone="muted"
          options={NAIVE}
          subscribe={subscribe}
          bubbleFade
        />
        <Bubble
          key={`tuned-${epoch}`}
          title="기법 적용"
          hint="위에서 켠 기법만 적용"
          tone="accent"
          options={options}
          subscribe={subscribe}
          bubbleFade={false}
        />
      </section>

      <section class="flex flex-col gap-2 rounded-2xl p-5 text-[12.5px] leading-relaxed text-foreground-muted glass">
        <p class="font-semibold text-foreground">볼 것</p>
        <p>
          · 렌더 횟수: 조각마다 그리면 조각 수만큼 마크다운을 다시 파싱합니다.
          50ms로 모으면 속도를 올릴수록 차이가 커져요.
        </p>
        <p>
          · 왼쪽 말풍선은 조각이 올 때마다 이미 읽던 문장까지 통째로 다시
          흐려집니다. 오른쪽은 새 글자만 떠요.
        </p>
        <p>
          · 차트 블록이 오는 동안 왼쪽은 빨간 실패 화면이 깜빡이다가 마지막에
          차트로 바뀝니다. 자리표시자를 끄면 오른쪽도 같아져요.
        </p>
        <p>
          · 도구 호출 대기 동안 왼쪽은 다 쓴 것처럼 멈춰 보입니다. 오른쪽은 점
          세 개가 아직 진행 중이라고 알려줘요.
        </p>
      </section>
    </div>
  );
}
