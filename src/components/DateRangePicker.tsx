"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
      className="flex flex-wrap items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-100"
    >
      <label className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Start</span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-md border border-white/15 bg-[var(--pp-bg)] px-2 py-1 text-xs text-white"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">End</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded-md border border-white/15 bg-[var(--pp-bg)] px-2 py-1 text-xs text-white"
        />
      </label>
      <button
        type="submit"
        className="rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:-translate-y-0.5"
      >
        Apply
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => quickApply(7)}
          className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/90 transition hover:border-white/30"
        >
          Last 7d
        </button>
        <button
          type="button"
          onClick={() => quickApply(30)}
          className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/90 transition hover:border-white/30"
        >
          Last 30d
        </button>
      </div>
    </form>
  );
}
