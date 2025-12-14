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
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 shadow-[0_10px_30px_-22px_rgba(0,0,0,0.9)] backdrop-blur"
      aria-label="Select date range"
    >
      <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-base"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4.5 w-4.5 text-slate-200"
          >
            <rect x="4" y="6" width="16" height="14" rx="2" />
            <path d="M4 10h16" />
            <path d="M9 4v4" />
            <path d="M15 4v4" />
          </svg>
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-slate-400">Time range</span>
          <span className="text-sm font-semibold text-white">{periodSummary}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.12em]">From</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-xl border border-white/10 bg-[var(--pp-bg)] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-200 focus:ring-2 focus:ring-cyan-200/35"
          />
        </label>
        <span className="text-slate-500">–</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.12em]">To</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-xl border border-white/10 bg-[var(--pp-bg)] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-200 focus:ring-2 focus:ring-cyan-200/35"
          />
        </label>
      </div>
      <div className="flex items-center gap-1.5 text-xs sm:ml-auto">
        <button
          type="button"
          onClick={() => quickApply(7)}
          className="rounded-lg border border-white/10 bg-white/0 px-2.5 py-1.5 font-semibold text-white/90 transition hover:border-white/30 hover:bg-white/5"
        >
          Last 7d
        </button>
        <button
          type="button"
          onClick={() => quickApply(30)}
          className="rounded-lg border border-white/10 bg-white/0 px-2.5 py-1.5 font-semibold text-white/90 transition hover:border-white/30 hover:bg-white/5"
        >
          Last 30d
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 py-1.75 text-[12px] font-semibold text-white transition hover:border-white/25 hover:bg-white/12"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
