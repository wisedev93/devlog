/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

/**
 * 순차 vs 병렬 업로드 타임라인.
 *
 * 모델 (단순화):
 *   업로드 한 장 = 핸드셰이크 H (고정 비용) + 전송 T (대역폭 점유)
 *   - 순차 : 한 장씩. 총 = N × (H + T)
 *   - 병렬 : 핸드셰이크는 겹쳐서 한 번 ≈ H. 전송은 같은 회선을 N개가
 *            나눠 쓰므로 전송 구간의 벽시계 시간 = N × T. 총 ≈ H + N × T
 *
 * 그래서 병렬이 줄이는 건 핸드셰이크의 "쌓임"뿐이고, 전송 시간 자체는
 * 거의 그대로다 — 글 본문에서 말한 그 비대칭을 슬라이더로 직접 본다.
 */

type Scenario = { n: number; h: number; t: number };

const PRESETS: { label: string; hint: string; s: Scenario }[] = [
  { label: "모바일 · 작은 사진", hint: "지연이 지배적", s: { n: 4, h: 380, t: 320 } },
  { label: "균형", hint: "기본값", s: { n: 4, h: 280, t: 1100 } },
  { label: "Wi-Fi · 무거운 원본", hint: "전송이 지배적", s: { n: 4, h: 110, t: 2600 } },
];

const PLAY_MS = 2800; // 재생 애니메이션의 실제 길이

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 슬라이더
// ─────────────────────────────────────────────────────────────────────────────

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onInput,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onInput: (v: number) => void;
}) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="flex items-baseline justify-between">
        <span class="text-[13px] font-semibold text-foreground">{label}</span>
        <span class="font-app text-[13px] text-accent">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={e => onInput(Number((e.target as HTMLInputElement).value))}
        class="w-full accent-accent"
      />
      <span class="text-[11px] text-foreground-muted">{hint}</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 타임라인 — N 개의 막대
// ─────────────────────────────────────────────────────────────────────────────

type Bar = { left: number; hs: number; tr: number };

function Timeline({
  name,
  tone,
  bars,
  total,
  scale,
  playPct,
}: {
  name: string;
  tone: "muted" | "accent";
  bars: Bar[];
  total: number;
  scale: number; // 100% 에 해당하는 ms
  playPct: number | null;
}) {
  const totalPct = (total / scale) * 100;
  return (
    <div class="flex flex-col gap-2.5 rounded-2xl p-5 glass">
      <div class="flex items-baseline justify-between">
        <span
          class={`text-sm font-semibold ${
            tone === "accent" ? "text-accent" : "text-foreground"
          }`}
        >
          {name}
        </span>
        <span class="font-app text-[13px] text-foreground-muted">
          총 <span class="text-foreground">{fmt(total)}</span>
        </span>
      </div>

      <div class="relative">
        <div class="flex flex-col gap-1.5">
          {bars.map((b, i) => (
            <div
              key={i}
              class="relative h-6 rounded-md bg-background-elevated/70"
            >
              <div
                class="absolute top-0 h-full rounded-l-md bg-amber-400/80"
                style={{ left: `${b.left}%`, width: `${b.hs}%` }}
              />
              <div
                class={`absolute top-0 h-full rounded-r-md ${
                  tone === "accent" ? "bg-accent" : "bg-accent/55"
                }`}
                style={{ left: `${b.left + b.hs}%`, width: `${b.tr}%` }}
              />
              <span class="absolute top-1/2 left-1.5 -translate-y-1/2 font-app text-[10px] text-foreground/70">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* 종료 지점 */}
        <div
          class="absolute -top-0.5 bottom-0 w-px bg-foreground/25"
          style={{ left: `${totalPct}%` }}
        />

        {/* 재생 헤드 */}
        {playPct !== null && (
          <div
            class="absolute -top-0.5 bottom-0 w-0.5 bg-foreground"
            style={{ left: `${Math.min(playPct, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadTimelineLab() {
  const [n, setN] = useState(4);
  const [h, setH] = useState(280);
  const [t, setT] = useState(1100);

  const [playT, setPlayT] = useState<number | null>(null); // 재생 중 시뮬레이션 시각(ms)
  const rafRef = useRef<number | null>(null);

  // 파생값
  const { seqTotal, parTotal, speedup, seqBars, parBars } = useMemo(() => {
    const seqTotal = n * (h + t);
    const parTotal = h + n * t;
    const scale = seqTotal; // 순차가 항상 가장 길다
    const seqBars: Bar[] = [];
    const parBars: Bar[] = [];
    for (let i = 0; i < n; i++) {
      // 순차 — i 번째는 앞선 i 장이 끝난 뒤 시작
      const start = i * (h + t);
      seqBars.push({
        left: (start / scale) * 100,
        hs: (h / scale) * 100,
        tr: (t / scale) * 100,
      });
      // 병렬 — 모두 0 에서 시작, 전송은 N 배 느리게
      parBars.push({
        left: 0,
        hs: (h / scale) * 100,
        tr: ((n * t) / scale) * 100,
      });
    }
    return { seqTotal, parTotal, speedup: seqTotal / parTotal, seqBars, parBars };
  }, [n, h, t]);

  // 재생 — 같은 시뮬레이션 시각을 두 타임라인이 공유한다.
  function play() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const ratio = Math.min((now - start) / PLAY_MS, 1);
      setPlayT(ratio * seqTotal);
      if (ratio < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        window.setTimeout(() => setPlayT(null), 700);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function applyPreset(s: Scenario) {
    setN(s.n);
    setH(s.h);
    setT(s.t);
  }

  const playPct = playT === null ? null : (playT / seqTotal) * 100;
  // 재생 중 각 타임라인이 "이미 끝났는지"
  const parDone = playT !== null && playT >= parTotal;
  const seqDone = playT !== null && playT >= seqTotal;

  return (
    <div id="timeline" class="flex flex-col gap-8 py-6">
      <header class="flex flex-col gap-2">
        <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
          sequential vs parallel
        </p>
        <h2 class="text-xl font-semibold text-foreground sm:text-2xl">
          병렬 업로드는 왜 장수만큼 빨라지지 않을까
        </h2>
        <p class="text-sm text-foreground-muted">
          업로드 한 장을 <span class="text-amber-300">핸드셰이크(고정 비용)</span>
          와 <span class="text-accent">전송(대역폭 점유)</span> 둘로 쪼개서,
          순차와 병렬의 타임라인을 같은 시간 축 위에 겹쳐 봅니다. 슬라이더를
          움직이면 단축 배수가 1배에서 N배 사이를 오가는 게 보여요.
        </p>
      </header>

      {/* 컨트롤 */}
      <div class="flex flex-col gap-5 rounded-2xl p-5 glass sm:p-6">
        <div class="grid gap-5 sm:grid-cols-3">
          <Slider
            label="사진 장수"
            hint="동시에 올릴 파일 수 (N)"
            value={n}
            min={1}
            max={6}
            step={1}
            display={`${n}장`}
            onInput={setN}
          />
          <Slider
            label="핸드셰이크 H"
            hint="DNS · TLS · 요청 왕복 — 장당 고정 비용"
            value={h}
            min={50}
            max={800}
            step={10}
            display={fmt(h)}
            onInput={setH}
          />
          <Slider
            label="전송 T"
            hint="장당 전송 시간 (회선을 혼자 쓸 때 기준)"
            value={t}
            min={100}
            max={4000}
            step={50}
            display={fmt(t)}
            onInput={setT}
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-1 text-[11px] tracking-[0.2em] text-foreground-muted uppercase">
            preset
          </span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.s)}
              class="rounded-full border border-border bg-background-elevated px-3 py-1.5 text-[12px] text-foreground-muted transition hover:border-accent hover:text-foreground"
            >
              {p.label}
              <span class="ml-1.5 text-foreground-muted/60">· {p.hint}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={play}
            class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-background shadow-[0_0_18px_var(--accent-glow)] transition hover:shadow-[0_0_28px_var(--accent-glow)]"
          >
            ▶ 재생
          </button>
        </div>
      </div>

      {/* 결과 요약 */}
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="flex flex-col gap-1 rounded-2xl p-5 glass">
          <span class="text-[11px] tracking-[0.2em] text-foreground-muted uppercase">
            순차
          </span>
          <span class="font-app text-2xl text-foreground">{fmt(seqTotal)}</span>
          <span class="text-[11.5px] text-foreground-muted">
            N × (H + T) = {n} × ({fmt(h)} + {fmt(t)})
          </span>
        </div>
        <div class="flex flex-col gap-1 rounded-2xl border border-accent/40 p-5 glass">
          <span class="text-[11px] tracking-[0.2em] text-accent uppercase">
            병렬
          </span>
          <span class="font-app text-2xl text-accent">{fmt(parTotal)}</span>
          <span class="text-[11.5px] text-foreground-muted">
            H + N × T = {fmt(h)} + {n} × {fmt(t)}
          </span>
        </div>
        <div class="flex flex-col gap-1 rounded-2xl p-5 glass">
          <span class="text-[11px] tracking-[0.2em] text-foreground-muted uppercase">
            단축 배수
          </span>
          <span class="font-app text-2xl text-foreground">
            {speedup.toFixed(2)}×
          </span>
          <span class="text-[11.5px] text-foreground-muted">
            이론 한계 {n}× (전송이 0 일 때)
          </span>
        </div>
      </div>

      {/* 타임라인 */}
      <div class="flex flex-col gap-3">
        <Timeline
          name={`순차 — for 루프 + await${seqDone ? "  ✓ 완료" : ""}`}
          tone="muted"
          bars={seqBars}
          total={seqTotal}
          scale={seqTotal}
          playPct={playPct}
        />
        <Timeline
          name={`병렬 — Promise.all${parDone ? "  ✓ 완료" : ""}`}
          tone="accent"
          bars={parBars}
          total={parTotal}
          scale={seqTotal}
          playPct={playPct}
        />
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[11.5px] text-foreground-muted">
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2.5 w-4 rounded-sm bg-amber-400/80" />
            핸드셰이크 H — 병렬에서 겹쳐 사라지는 비용
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2.5 w-4 rounded-sm bg-accent" />
            전송 T — 대역폭을 나눠 써서 거의 안 줄어드는 비용
          </span>
        </div>
      </div>

      {/* 해설 */}
      <div class="flex flex-col gap-2 rounded-2xl p-5 glass">
        <p class="text-[13px] leading-relaxed text-foreground-muted">
          <span class="font-semibold text-foreground">읽는 법.</span> 두 타임라인은
          같은 시간 축을 씁니다. 병렬은 핸드셰이크
          <span class="text-amber-300"> 막대들이 0 에 겹쳐</span> 한 칸으로
          줄지만, 전송
          <span class="text-accent"> 막대는 N 배로 길어집니다</span> — 같은 회선의
          대역폭을 N 장이 나눠 쓰니까요. 그래서 병렬이 줄이는 건 결국
          핸드셰이크의 쌓임 <span class="font-app">(N−1) × H</span> 뿐이에요.
        </p>
        <p class="text-[13px] leading-relaxed text-foreground-muted">
          전송 T 를 0 에 가깝게 내리면 단축 배수가 N 에 닿고, H 를 0 에 가깝게
          내리면 1 에 붙습니다. 현실의 사진 업로드는 그 사이 어딘가라, "몇 배
          빨라졌다"는 <span class="text-foreground">측정해야</span> 알 수 있는
          숫자예요.
        </p>
        <p class="mt-1 text-[11px] text-foreground-muted/70">
          ※ 대역폭이 완벽히 균등 분배되고 핸드셰이크가 완전히 겹친다고 가정한
          단순 모델입니다. 실제로는 HTTP/2 다중화, 연결 수 제한, 서버측
          병렬도에 따라 달라집니다.
        </p>
      </div>
    </div>
  );
}
