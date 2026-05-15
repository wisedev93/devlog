/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { z } from "zod";

const PRIMARY_OPTIONS = ["옵션 A1", "옵션 A2", "옵션 A3"] as const;
const SECONDARY_OPTIONS = ["옵션 1", "옵션 2", "옵션 3", "옵션 4"] as const;

const schema = z.object({
  primary: z
    .array(z.enum(PRIMARY_OPTIONS))
    .min(1, "옵션 A 를 1개 이상 선택해주세요"),
  secondary: z.array(z.enum(SECONDARY_OPTIONS)).default([]),
  secondary_etc: z.string().trim().max(200).optional().or(z.literal("")),
  keywords: z.array(z.string().trim().max(40)).max(3).default([]),
});

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

function flattenZodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 다이어그램 — 세 레이어 어긋남
// ─────────────────────────────────────────────────────────────────────────────

type RowStatus = "ok" | "missing" | "free";
type LayerRow = { label: string; status: RowStatus; highlight?: boolean };

function StatusDot({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { bg: string; fg: string; char: string }> = {
    ok: { bg: "bg-accent/20", fg: "text-accent", char: "✓" },
    missing: {
      bg: "bg-rose-500/20",
      fg: "text-rose-300",
      char: "✕",
    },
    free: {
      bg: "bg-amber-400/20",
      fg: "text-amber-300",
      char: "*",
    },
  };
  const m = map[status];
  return (
    <span
      class={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${m.bg} ${m.fg}`}
    >
      {m.char}
    </span>
  );
}

function LayerCard({
  index,
  name,
  rule,
  rows,
}: {
  index: string;
  name: string;
  rule: string;
  rows: LayerRow[];
}) {
  return (
    <div class="flex flex-col gap-4 rounded-2xl p-5 glass">
      <div class="flex items-center justify-between">
        <span class="font-app text-sm text-accent">{index}</span>
        <span class="text-[10px] tracking-[0.3em] text-foreground-muted uppercase">
          layer
        </span>
      </div>
      <div>
        <h3 class="text-base font-semibold text-foreground">{name}</h3>
        <p class="mt-1 font-app text-xs leading-relaxed text-foreground-muted">
          {rule}
        </p>
      </div>
      <span class="block h-px bg-border" />
      <ul class="flex flex-col gap-2">
        {rows.map(r => (
          <li
            class={`flex items-center gap-2.5 text-[13px] ${
              r.highlight
                ? "font-semibold text-foreground"
                : "text-foreground-muted"
            }`}
          >
            <StatusDot status={r.status} />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Diagram() {
  return (
    <section id="diagram" class="flex flex-col gap-6">
      <header class="flex flex-col gap-2">
        <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
          three layers
        </p>
        <h2 class="text-xl font-semibold text-foreground sm:text-2xl">
          같은 데이터, 서로 다른 제약
        </h2>
        <p class="text-sm text-foreground-muted">
          UI · Schema · DB 세 곳이 같은 "옵션 셋"을 다루는데, 각자 다른 룰을
          가지고 있어요. "기타"의 위치를 따라가 보면 어긋남이 보입니다.
        </p>
      </header>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <LayerCard
          index="A"
          name="UI"
          rule="옵션 1~4 + '기타' 칩"
          rows={[
            { label: "옵션 1", status: "ok" },
            { label: "옵션 2", status: "ok" },
            { label: "옵션 3", status: "ok" },
            { label: "옵션 4", status: "ok" },
            { label: "기타", status: "ok", highlight: true },
          ]}
        />
        <LayerCard
          index="B"
          name="Schema (zod)"
          rule="z.enum([옵션1..옵션4])"
          rows={[
            { label: "옵션 1", status: "ok" },
            { label: "옵션 2", status: "ok" },
            { label: "옵션 3", status: "ok" },
            { label: "옵션 4", status: "ok" },
            { label: "기타", status: "missing", highlight: true },
          ]}
        />
        <LayerCard
          index="C"
          name="DB (text[])"
          rule="text[] / 제약 없음"
          rows={[
            { label: "옵션 1", status: "free" },
            { label: "옵션 2", status: "free" },
            { label: "옵션 3", status: "free" },
            { label: "옵션 4", status: "free" },
            { label: "기타", status: "free", highlight: true },
          ]}
        />
      </div>

      <div class="flex flex-col gap-3 rounded-2xl p-5 glass sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/25 text-sm font-bold text-rose-200">
            !
          </span>
          <div>
            <p class="text-sm font-semibold text-foreground">"기타"의 위치</p>
            <p class="mt-1 text-xs text-foreground-muted">
              UI ✓ · Schema ✕ · DB ✓ — 가운데 한 곳만 어긋나 있어요.
            </p>
          </div>
        </div>
        <p class="font-app text-xs text-foreground-muted">
          UI ──▶ <span class="text-rose-300">Schema</span> ──▶ DB
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 폼 — silent failure 재현
// ─────────────────────────────────────────────────────────────────────────────

function Chip({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
        checked
          ? "border-accent bg-accent text-background shadow-[0_0_18px_var(--accent-glow)]"
          : "border-border bg-background-elevated text-foreground-muted hover:border-accent/60 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Form() {
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [secondaryEtc, setSecondaryEtc] = useState("");
  const [keywords, setKeywords] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);

  const [clickedNextAt, setClickedNextAt] = useState<string | null>(null);
  const [movedNext, setMovedNext] = useState(false);

  const [devPanelOpen, setDevPanelOpen] = useState(true);

  const panelRef = useRef<HTMLElement | null>(null);

  // 라이브 검증 — 폼 state 가 바뀔 때마다 다시 safeParse.
  const { errors, data, success } = useMemo(() => {
    const payload = {
      primary,
      secondary,
      secondary_etc: secondaryEtc,
      keywords: keywords.map(s => s.trim()).filter(Boolean),
    };
    const result = schema.safeParse(payload);
    return {
      data: payload,
      errors: result.success ? {} : flattenZodErrors(result.error),
      success: result.success,
    };
  }, [primary, secondary, secondaryEtc, keywords]);

  const errorCount = Object.keys(errors).length;

  function onNext() {
    setClickedNextAt(new Date().toISOString());
    setMovedNext(success);
  }

  function reset() {
    setPrimary([]);
    setSecondary([]);
    setSecondaryEtc("");
    setKeywords(["", "", ""]);
    setClickedNextAt(null);
    setMovedNext(false);
  }

  // 모바일에서만 검증 직후 패널로 부드러운 스크롤.
  useEffect(() => {
    if (clickedNextAt === null) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clickedNextAt]);

  return (
    <section id="dev-panel" class="flex flex-col gap-6">
      <header class="flex flex-col gap-2">
        <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
          silent failure form
        </p>
        <h2 class="text-xl font-semibold text-foreground sm:text-2xl">
          폼에서 일어나는 일을 직접 만져보기
        </h2>
        <p class="text-sm text-foreground-muted">
          "기타" 칩을 누르고 다음 단계를 눌러보세요. 폼 UI 에는 빨간 에러가 어디
          에도 안 뜨지만, 우측 패널의 errors 에는 <code>secondary.N</code> 같은
          인덱스 키가 분명히 들어있습니다.
        </p>
      </header>

      {/* dev 패널 토글 */}
      <div class="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDevPanelOpen(v => !v)}
          aria-pressed={devPanelOpen}
          class="inline-flex items-center gap-3 rounded-full px-4 py-2 text-xs text-foreground-muted glass transition hover:text-foreground"
        >
          <span
            class={`relative inline-block h-5 w-9 rounded-full transition ${
              devPanelOpen ? "bg-accent" : "bg-border-strong"
            }`}
          >
            <span
              class={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${
                devPanelOpen ? "left-4.5" : "left-0.5"
              }`}
            />
          </span>
          <span class="font-semibold tracking-wide">
            dev 패널{" "}
            <span
              class={devPanelOpen ? "text-accent" : "text-foreground-muted"}
            >
              {devPanelOpen ? "ON · 개발자 시각" : "OFF · 사용자 시각"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={reset}
          class="text-xs text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          초기화
        </button>
      </div>

      <div
        class={`grid items-start gap-6 ${
          devPanelOpen ? "lg:grid-cols-[1fr_360px]" : "lg:grid-cols-1"
        }`}
      >
        {/* ─── 좌측: 폼 카드 ─── */}
        <div class="flex flex-col gap-6 rounded-2xl p-6 glass sm:p-7">
          <header class="flex flex-col gap-1 border-b border-border pb-4">
            <p class="font-app text-[11px] tracking-[0.35em] text-accent uppercase">
              Step 01
            </p>
            <h3 class="text-lg font-semibold text-foreground">제목</h3>
          </header>

          {/* 그룹 A */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-semibold text-foreground">
                옵션 A
              </span>
              <span class="text-sm leading-none text-accent">*</span>
            </div>
            <p class="text-[11.5px] text-foreground-muted">
              중복 선택 가능합니다
            </p>
            <div class="flex flex-wrap gap-2 pt-1">
              {PRIMARY_OPTIONS.map(opt => (
                <Chip
                  key={opt}
                  label={opt}
                  checked={primary.includes(opt)}
                  onClick={() => setPrimary(toggle(primary, opt))}
                />
              ))}
            </div>
            {clickedNextAt !== null && errors.primary && (
              <p class="mt-1.5 text-[12px] text-rose-300">{errors.primary}</p>
            )}
          </div>

          {/* 그룹 B — silent failure 자리 */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-semibold text-foreground">
                옵션 B
              </span>
              <span class="text-[11px] text-foreground-muted">(선택)</span>
            </div>
            <p class="text-[11.5px] text-foreground-muted">
              해당되는 항목을 모두 선택해주세요
            </p>
            <div class="flex flex-wrap gap-2 pt-1">
              {SECONDARY_OPTIONS.map(opt => (
                <Chip
                  key={opt}
                  label={opt}
                  checked={secondary.includes(opt)}
                  onClick={() => setSecondary(toggle(secondary, opt))}
                />
              ))}
              <Chip
                label="⁉️ 기타"
                checked={secondary.includes("기타")}
                onClick={() => setSecondary(toggle(secondary, "기타"))}
              />
            </div>
            {secondary.includes("기타") && (
              <input
                type="text"
                class="mt-2 w-full rounded-lg border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
                placeholder="기타 항목을 입력해주세요"
                value={secondaryEtc}
                onInput={e =>
                  setSecondaryEtc((e.target as HTMLInputElement).value)
                }
              />
            )}
            {/* secondary 의 검증 에러는 의도적으로 표시하지 않음 — silent failure 그 자체 */}
          </div>

          {/* 그룹 C */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-semibold text-foreground">
                텍스트 키워드 3가지
              </span>
              <span class="text-[11px] text-foreground-muted">(선택)</span>
            </div>
            <p class="text-[11.5px] text-foreground-muted">
              자유롭게 적어주세요
            </p>
            <div class="flex flex-col gap-2 pt-1">
              {[0, 1, 2].map(i => (
                <div key={i} class="flex items-center gap-2.5">
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-background">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    class="w-full rounded-lg border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
                    placeholder={`${["첫", "두", "세"][i]} 번째 키워드`}
                    value={keywords[i] ?? ""}
                    onInput={e => {
                      const next = [...keywords] as [string, string, string];
                      next[i] = (e.target as HTMLInputElement).value;
                      setKeywords(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onNext}
            class="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-background shadow-[0_0_18px_var(--accent-glow)] transition hover:shadow-[0_0_28px_var(--accent-glow)]"
          >
            다음 단계 <span aria-hidden>➡️</span>
          </button>

          {movedNext && (
            <p class="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-[13px] text-accent">
              ✓ 검증 통과 — 실제 폼이었다면 다음 단계로 진행됐을 거예요.
            </p>
          )}
        </div>

        {/* ─── 우측: dev 패널 (토글로 노출) ─── */}
        {devPanelOpen && (
          <aside
            ref={panelRef}
            class="overflow-hidden rounded-2xl glass lg:sticky lg:top-6"
          >
            <header class="flex items-center justify-between border-b border-border px-5 py-3">
              <span class="font-app text-[11px] tracking-[0.35em] text-foreground-muted uppercase">
                live · validation
              </span>
              <span
                class={`inline-flex items-center gap-1.5 text-[11px] ${
                  success ? "text-accent" : "text-rose-300"
                }`}
              >
                <span
                  class={`h-1.5 w-1.5 rounded-full ${
                    success ? "bg-accent" : "animate-pulse bg-rose-400"
                  }`}
                />
                {success
                  ? "passing"
                  : `${errorCount} error${errorCount > 1 ? "s" : ""}`}
              </span>
            </header>

            <div class="border-b border-border bg-background/60 px-5 py-4 font-app text-[12px] leading-relaxed text-foreground/90">
              <p class="mb-2 text-[10px] tracking-[0.3em] text-foreground-muted uppercase">
                form state
              </p>
              <pre class="break-all whitespace-pre-wrap">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>

            <div class="bg-background/60 px-5 py-4 font-app text-[12.5px] leading-relaxed text-foreground/90">
              <p class="mb-2 text-[10px] tracking-[0.3em] text-foreground-muted uppercase">
                errors (zod)
              </p>
              {errorCount === 0 ? (
                <p class="text-accent">{"{ /* 통과 */ }"}</p>
              ) : (
                <pre class="break-all whitespace-pre-wrap">
                  {JSON.stringify(errors, null, 2)}
                </pre>
              )}
            </div>

            {clickedNextAt !== null && (
              <div
                class={`border-t border-border px-5 py-3 text-[11px] ${
                  success
                    ? "bg-accent/10 text-accent"
                    : "bg-rose-500/10 text-rose-200"
                }`}
              >
                <p class="font-semibold tracking-wide">
                  {success
                    ? "✓ next() — 다음 단계로 진행"
                    : "✕ next() — 진행 막힘 (사용자에게는 보이지 않음)"}
                </p>
                <p class="mt-1 text-foreground-muted">
                  clicked at{" "}
                  {new Date(clickedNextAt).toLocaleTimeString("ko-KR", {
                    hour12: false,
                  })}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 — 다이어그램 + 폼 한 컴포넌트에
// ─────────────────────────────────────────────────────────────────────────────

export default function SilentFailureLab() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div class="flex flex-col gap-16 py-8">
      <Diagram />
      <span class="h-px w-full bg-border" />
      <Form />
    </div>
  );
}
