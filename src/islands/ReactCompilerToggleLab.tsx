/** @jsxImportSource preact */
import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

/**
 * React Compiler on/off 시뮬레이션.
 *
 * 같은 화면(부모 입력 + 자식 row 목록)을 두 모드로 나란히 렌더한다.
 *   - compiler ON  : row 가 자동 메모이즈된 것처럼 동작 (props 가 같으면 skip)
 *   - compiler OFF : 부모가 렌더될 때마다 모든 row 가 다시 렌더
 *
 * 실제 React Compiler 를 브라우저에서 돌리는 게 아니라, compiler 가 만들어내는
 * "결과 동작"(props 불변 시 재렌더 skip)을 memo 로 재현한 시뮬레이션이다.
 * row 마다 렌더 횟수를 세고, 렌더가 일어난 순간 flash 로 표시한다.
 */

type Item = {
  id: string;
  group: "필터1" | "필터2";
  value: number;
  status: "상태1" | "상태2" | "상태3";
};

const ITEMS: Item[] = [
  { id: "ITEM-001", group: "필터1", value: 100, status: "상태1" },
  { id: "ITEM-002", group: "필터2", value: 7, status: "상태2" },
  { id: "ITEM-003", group: "필터1", value: 200, status: "상태2" },
  { id: "ITEM-004", group: "필터2", value: 11, status: "상태3" },
  { id: "ITEM-005", group: "필터1", value: 100, status: "상태1" },
  { id: "ITEM-006", group: "필터2", value: 7, status: "상태2" },
];

const STATUS_TONE: Record<Item["status"], string> = {
  상태1: "text-accent",
  상태2: "text-foreground-muted",
  상태3: "text-amber-300",
};

// ─────────────────────────────────────────────────────────────────────────────
// Row — 렌더될 때마다 자기 카운터를 올리고 flash 한다
// ─────────────────────────────────────────────────────────────────────────────

/** 패널별 렌더 집계. 렌더 패스 중에 mutate 되고, 목록 뒤의 Totals 가 읽는다. */
type Tally = { renders: number };

function RowBase({ item, tally }: { item: Item; tally: Tally }) {
  const count = useRef(0);
  const el = useRef<HTMLDivElement>(null);

  // 렌더 패스 안에서 증가 — 이 컴포넌트가 "실제로 렌더됐는가"를 그대로 센다.
  count.current += 1;
  tally.renders += 1;

  // 커밋 직후 flash. deps 없는 effect 는 렌더마다 돌고, 렌더가 skip 되면 안 돈다.
  useEffect(() => {
    el.current?.animate(
      [
        {
          backgroundColor:
            "color-mix(in oklab, var(--accent) 22%, transparent)",
        },
        { backgroundColor: "transparent" },
      ],
      { duration: 550 },
    );
  });

  return (
    <div
      ref={el}
      class="flex items-center justify-between rounded-lg bg-background-elevated/60 px-3 py-2"
    >
      <span class="font-app text-[12px] text-foreground">{item.id}</span>
      <span class="text-[11.5px] text-foreground-muted">
        {item.group} · 값 {item.value}
      </span>
      <span class={`text-[11.5px] ${STATUS_TONE[item.status]}`}>
        {item.status}
      </span>
      <span class="font-app w-16 text-right text-[11px] text-foreground-muted">
        렌더 <span class="text-foreground">{count.current}</span>회
      </span>
    </div>
  );
}

/** compiler ON 모드 — props 가 같으면 skip (compiler 결과 동작의 재현) */
const RowMemo = memo(RowBase);

// ─────────────────────────────────────────────────────────────────────────────
// Totals — 목록 "뒤"에 두어서 같은 렌더 패스의 집계를 읽는다
// ─────────────────────────────────────────────────────────────────────────────

function Totals({ tally, tone }: { tally: Tally; tone: "muted" | "accent" }) {
  return (
    <div class="flex items-baseline justify-between px-1 pt-1">
      <span class="text-[11px] tracking-[0.2em] text-foreground-muted uppercase">
        누적 row 렌더
      </span>
      <span
        class={`font-app text-lg ${tone === "accent" ? "text-accent" : "text-foreground"}`}
      >
        {tally.renders}회
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 패널 — 한 모드의 서브트리 전체
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  name,
  hint,
  tone,
  memoized,
  items,
  tally,
  epoch,
  children,
}: {
  name: string;
  hint: string;
  tone: "muted" | "accent";
  memoized: boolean;
  items: Item[];
  tally: Tally;
  epoch: number;
  children?: ComponentChildren;
}) {
  const Row = memoized ? RowMemo : RowBase;
  return (
    <div class="flex flex-col gap-2.5 rounded-2xl p-5 glass">
      <div class="flex items-baseline justify-between">
        <span
          class={`text-sm font-semibold ${tone === "accent" ? "text-accent" : "text-foreground"}`}
        >
          {name}
        </span>
        <span class="text-[11px] text-foreground-muted">{hint}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        {items.map(it => (
          // epoch 가 바뀌면 key 가 바뀌어 row 가 remount — 카운터 리셋용
          <Row key={`${epoch}:${it.id}`} item={it} tally={tally} />
        ))}
      </div>
      <Totals tally={tally} tone={tone} />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────

export default function ReactCompilerToggleLab() {
  // 부모 상태 셋 — row 와의 관련도가 전부 다르다.
  const [note, setNote] = useState(""); // row 와 무관한 입력
  const [filter, setFilter] = useState<"전체" | "필터1" | "필터2">("전체"); // row 목록을 바꿈
  const [desc, setDesc] = useState(false); // row 순서를 바꿈
  const [epoch, setEpoch] = useState(0); // 리셋 시 row remount 용

  const onTally = useRef<Tally>({ renders: 0 }).current;
  const offTally = useRef<Tally>({ renders: 0 }).current;

  // 필터/정렬이 바뀔 때만 "새 데이터 객체"를 만든다 — 실제 앱에서 필터 변경이
  // refetch 로 새 응답 객체를 받는 상황의 재현. 무관한 입력(note)으로 부모가
  // 렌더될 때는 같은 참조가 유지되어, ON 패널의 row 가 skip 할 수 있다.
  const rows = useMemo(() => {
    const filtered = ITEMS.filter(
      it => filter === "전체" || it.group === filter,
    );
    const ordered = desc ? [...filtered].reverse() : filtered;
    return ordered.map(it => ({ ...it }));
  }, [filter, desc]);

  function reset() {
    // remount 직후 각 row 가 mount 렌더를 1회씩 하므로,
    // 리셋 결과는 새로고침 직후와 동일한 상태(row 1회, 합계 = row 수)가 된다.
    onTally.renders = 0;
    offTally.renders = 0;
    setNote("");
    setFilter("전체");
    setDesc(false);
    setEpoch(e => e + 1);
  }

  return (
    <div class="flex flex-col gap-8 py-6">
      <header class="flex flex-col gap-2">
        <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
          react compiler on / off
        </p>
        <h2 class="text-xl font-semibold text-foreground sm:text-2xl">
          부모가 렌더될 때, 자식은 몇 번 렌더될까
        </h2>
        <p class="text-sm text-foreground-muted">
          같은 화면을 두 모드로 나란히 렌더합니다. 아래 입력을 만질 때마다 두
          패널의 row 렌더 횟수가 어떻게 벌어지는지 보세요. row 가 실제로 렌더된
          순간에는 <span class="text-accent">flash</span>로 표시됩니다.
        </p>
      </header>

      {/* 컨트롤 — 두 패널이 공유하는 부모 상태 */}
      <div class="flex flex-col gap-4 rounded-2xl p-5 glass sm:p-6">
        <label class="flex flex-col gap-1.5">
          <span class="flex items-baseline justify-between">
            <span class="text-[13px] font-semibold text-foreground">
              row 와 무관한 입력
            </span>
            <span class="text-[11px] text-foreground-muted">
              부모 상태만 바뀜 — 여기서 두 모드가 갈린다
            </span>
          </span>
          <input
            type="text"
            value={note}
            onInput={e => setNote((e.target as HTMLInputElement).value)}
            placeholder="아무거나 타이핑해 보세요 (예: 모달의 다른 폼 필드)"
            class="rounded-lg border border-border bg-background-elevated px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none"
          />
        </label>

        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-1 text-[11px] tracking-[0.2em] text-foreground-muted uppercase">
            row 를 실제로 바꾸는 조작
          </span>
          {(["전체", "필터1", "필터2"] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              class={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                filter === f
                  ? "border-accent text-foreground"
                  : "border-border bg-background-elevated text-foreground-muted hover:border-accent hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDesc(v => !v)}
            class="rounded-full border border-border bg-background-elevated px-3 py-1.5 text-[12px] text-foreground-muted transition hover:border-accent hover:text-foreground"
          >
            정렬 뒤집기 {desc ? "↓" : "↑"}
          </button>
          <button
            type="button"
            onClick={reset}
            class="ml-auto rounded-full border border-border bg-background-elevated px-3 py-1.5 text-[12px] text-foreground-muted transition hover:border-accent hover:text-foreground"
          >
            카운터 리셋
          </button>
        </div>
      </div>

      {/* 두 패널 */}
      <div class="grid gap-3 sm:grid-cols-2">
        <Panel
          name="compiler OFF"
          hint="부모 렌더 = 모든 row 렌더"
          tone="muted"
          memoized={false}
          items={rows}
          tally={offTally}
          epoch={epoch}
        />
        <Panel
          name="compiler ON (시뮬레이션)"
          hint="props 가 같으면 row 는 skip"
          tone="accent"
          memoized={true}
          items={rows}
          tally={onTally}
          epoch={epoch}
        />
      </div>

      {/* 해설 */}
      <div class="flex flex-col gap-2 rounded-2xl p-5 glass">
        <p class="text-[13px] leading-relaxed text-foreground-muted">
          <span class="font-semibold text-foreground">읽는 법.</span> 무관한
          입력에 타이핑하면 부모는 글자마다 렌더되지만, ON 패널의 row 는 props
          가 그대로라 전부 skip 합니다. OFF 패널은 글자마다 row 6개가 전부 다시
          렌더돼요. 반대로 필터나 정렬은 실제 앱의 refetch 처럼{" "}
          <span class="text-foreground">새 데이터 객체</span>를 만들도록 해서 두
          모드 모두 렌더가 일어납니다 — 메모이즈가 아끼는 건 "참조가 안 바뀐
          것"뿐입니다.
        </p>
        <p class="text-[13px] leading-relaxed text-foreground-muted">
          본문 측정 2에서 수동 메모이즈 15곳을 지워도 커밋 수가 그대로였던 것,
          compiler 를 끄자 모달 렌더 시간이 2.3배가 된 것이 정확히 이 차이의
          실전판입니다.
        </p>
        <p class="mt-1 text-[11px] text-foreground-muted/70">
          ※ 이 데모는 실제 React Compiler 를 브라우저에서 돌리는 게 아니라,
          compiler 가 만들어내는 결과 동작(props 불변 시 재렌더 skip)을 memo 로
          재현한 시뮬레이션입니다. 실제 compiler 는 컴포넌트 단위 skip 에 더해
          컴포넌트 안의 식 단위 캐시까지 수행합니다.
        </p>
      </div>
    </div>
  );
}
