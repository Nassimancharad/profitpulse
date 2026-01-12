"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  startDate: string;
  endDate: string;
};

export function DateRangePicker({ startDate, endDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  const periodSummary = useMemo(() => {
    try {
      const startObj = new Date(start);
      const endObj = new Date(end);
      const startLabel = startObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const endLabel = endObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return `${startLabel} – ${endLabel}`;
    } catch {
      return "Custom range";
    }
  }, [start, end]);

  const updateRange = (nextStart: string, nextEnd: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("start", nextStart);
    params.set("end", nextEnd);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (start && end) {
      updateRange(start, end);
    }
  };

  const quickApply = (days: number) => {
    const today = new Date();
    const endIso = today.toISOString().slice(0, 10);
    const startDateObj = new Date();
    startDateObj.setDate(today.getDate() - (days - 1));
    const startIso = startDateObj.toISOString().slice(0, 10);
    setStart(startIso);
    setEnd(endIso);
    updateRange(startIso, endIso);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pp-card glass-surface flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-[color:var(--pp-foreground)]"
      aria-label="Select date range"
    >
      <div className="glass-inset flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-base"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4.5 w-4.5 text-[color:var(--pp-muted)]"
          >
            <rect x="4" y="6" width="16" height="14" rx="2" />
            <path d="M4 10h16" />
            <path d="M9 4v4" />
            <path d="M15 4v4" />
          </svg>
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-[color:var(--pp-muted)]">Time range</span>
          <span className="text-sm font-semibold text-[color:var(--pp-foreground)]">{periodSummary}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--pp-muted)]">
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.12em]">From</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="pp-input"
          />
        </label>
        <span className="text-[color:var(--pp-muted)]">–</span>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--pp-muted)]">
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.12em]">To</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="pp-input"
          />
        </label>
      </div>
      <div className="flex items-center gap-1.5 text-xs sm:ml-auto">
        <button
          type="button"
          onClick={() => quickApply(7)}
          className="pp-btn pp-btn-ghost px-2.5 py-1.5 text-xs text-[color:var(--pp-muted)] hover:text-[color:var(--pp-foreground)]"
        >
          Last 7d
        </button>
        <button
          type="button"
          onClick={() => quickApply(30)}
          className="pp-btn pp-btn-ghost px-2.5 py-1.5 text-xs text-[color:var(--pp-muted)] hover:text-[color:var(--pp-foreground)]"
        >
          Last 30d
        </button>
        <button
          type="submit"
          className="pp-btn pp-btn-primary px-3 py-1.75 text-[12px]"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
