import Link from "next/link";
import type { ReactNode } from "react";
import type { SetupProgress } from "@/lib/setupProgress";

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  delta: number | null;
  hint?: string;
};

export type Freshness = {
  status: "fresh" | "delayed" | "stale" | "unknown";
  label: string;
  detail: string;
};

export type InsightItem = {
  title: string;
  detail: string;
  priority: "High" | "Medium" | "Low";
};

export function DashboardCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`pp-card glass-surface ${className}`}>{children}</div>;
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Overview</p>
      <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">{title}</h3>
      {description ? <p className="text-sm text-[color:var(--pp-muted)]">{description}</p> : null}
    </div>
  );
}

function DeltaBadge({
  delta,
  formatDelta,
}: {
  delta: number | null;
  formatDelta: (delta: number | null) => string;
}) {
  const tone =
    delta === null
      ? "text-[color:var(--pp-muted)]"
      : delta >= 0
        ? "text-emerald-600"
        : "text-rose-600";
  return (
    <span className={`rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatDelta(delta)}
    </span>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-6 text-center text-sm text-[color:var(--pp-muted)]">
      {title}
    </div>
  );
}

function KpiCard({
  item,
  formatDelta,
}: {
  item: KpiItem;
  formatDelta: (delta: number | null) => string;
}) {
  return (
    <div className="pp-card glass-surface--subtle min-w-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">{item.label}</div>
        <DeltaBadge delta={item.delta} formatDelta={formatDelta} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-[color:var(--pp-foreground)]">{item.value}</div>
      {item.hint ? <div className="mt-1 text-xs text-[color:var(--pp-muted)]">{item.hint}</div> : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <div className="h-10 w-full rounded-lg bg-white/60" />;
  }
  const width = 160;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(242,122,40,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InsightCard({ insight }: { insight: InsightItem }) {
  const tone =
    insight.priority === "High"
      ? "bg-rose-100 text-rose-700"
      : insight.priority === "Medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  return (
    <div className="rounded-xl border border-[color:var(--pp-border)] bg-white/70 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[color:var(--pp-foreground)]">{insight.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
          {insight.priority}
        </span>
      </div>
      <div className="mt-2 text-xs text-[color:var(--pp-muted)]">{insight.detail}</div>
    </div>
  );
}

export function SetupGuideCard({ progress }: { progress: SetupProgress }) {
  return (
    <DashboardCard className="relative w-full max-w-full p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">Guided setup</div>
          <div className="text-xs text-[color:var(--pp-muted)]">
            {progress.completedSteps} of {progress.totalSteps} completed
          </div>
        </div>
        {progress.isComplete ? (
          <span className="pp-badge border-emerald-300/60 bg-emerald-100/60 text-emerald-700">
            Setup complete
          </span>
        ) : (
          <span className="pp-badge glass-inset text-xs">In progress</span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
        <div
          className="h-full rounded-full bg-[rgba(242,122,40,0.92)] transition-all"
          style={{ width: `${Math.round(progress.completionRatio * 100)}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {progress.steps.map((step, index) => (
          <Link
            key={step.id}
            href={step.href}
            className="rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 transition hover:border-[color:rgba(242,122,40,0.2)] hover:bg-white/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">Step {index + 1}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  step.complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {step.complete ? "Done" : "Pending"}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--pp-foreground)]">{step.title}</div>
            <div className="mt-1 text-xs text-[color:var(--pp-muted)]">{step.description}</div>
          </Link>
        ))}
      </div>
      {progress.isComplete ? (
        <div className="mt-4 rounded-xl border border-emerald-300/60 bg-emerald-100/50 px-4 py-3 text-sm text-emerald-700">
          Setup complete. Your store is ready for insights with connected data and cost inputs.
        </div>
      ) : null}
    </DashboardCard>
  );
}

export function KpiStrip({
  items,
  partialData,
  formatDelta,
}: {
  items: KpiItem[];
  partialData: boolean;
  formatDelta: (delta: number | null) => string;
}) {
  return (
    <DashboardCard className="relative w-full max-w-full p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">Key KPIs</div>
        {partialData ? <span className="pp-badge glass-inset text-xs">Partial data</span> : null}
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <KpiCard key={item.key} item={item} formatDelta={formatDelta} />
        ))}
      </div>
    </DashboardCard>
  );
}

export function TrendCard({
  label,
  value,
  delta,
  series,
  formatDelta,
}: {
  label: string;
  value: string;
  delta: number | null;
  series: number[];
  formatDelta: (delta: number | null) => string;
}) {
  return (
    <DashboardCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">{label}</div>
          <div className="mt-1 text-lg font-semibold text-[color:var(--pp-foreground)]">{value}</div>
        </div>
        <DeltaBadge delta={delta} formatDelta={formatDelta} />
      </div>
      <div className="mt-3 h-10">
        <Sparkline values={series} />
      </div>
    </DashboardCard>
  );
}

export function BreakdownList({
  title,
  description,
  items,
  currencyFormatter,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number; hint?: string }>;
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title={title} description={description} />
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyState title="No data for this period." />
        ) : (
          items.map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--pp-foreground)]">{item.label}</div>
                {item.hint ? <div className="text-xs text-[color:var(--pp-muted)]">{item.hint}</div> : null}
              </div>
              <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">
                {currencyFormatter.format(item.value)}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}

export function InsightsPanel({ insights }: { insights: InsightItem[] }) {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title="Alerts & insights" description="Focus on the biggest changes that need action." />
      <div className="mt-4 space-y-3">
        {insights.length === 0 ? (
          <EmptyState title="No alerts right now." />
        ) : (
          insights.map((insight) => <InsightCard key={insight.title} insight={insight} />)
        )}
      </div>
    </DashboardCard>
  );
}

export function DataFreshness({ freshness }: { freshness: Freshness }) {
  const color =
    freshness.status === "fresh"
      ? "bg-emerald-500"
      : freshness.status === "delayed"
        ? "bg-amber-500"
        : freshness.status === "stale"
          ? "bg-rose-500"
          : "bg-neutral-400";
  return (
    <div className="pp-badge glass-inset flex w-full items-center gap-2 px-3.5 py-1.5 text-xs sm:w-auto">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[color:var(--pp-muted)]">{freshness.label}</span>
      <span className="text-[color:var(--pp-foreground)]">{freshness.detail}</span>
    </div>
  );
}
