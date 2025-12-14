"use client";

import type { ReactNode } from "react";

type PageTopBarProps = {
  title: string;
  subtitle?: string;
  /**
   * Primary control, e.g. a date range picker. Should be concise and keyboard accessible.
   */
  timeControl?: ReactNode;
  /**
   * Text fallback when no interactive time control is rendered.
   */
  periodLabel?: string;
  /**
   * Optional shop context shown as muted text with a status dot.
   */
  shopLabel?: string;
  /**
   * Quiet secondary actions (e.g. sync, links, icon buttons).
   */
  secondaryActions?: ReactNode;
  /**
   * Future overflow / menu content.
   */
  overflowActions?: ReactNode;
};

export function PageTopBar({
  title,
  subtitle,
  timeControl,
  periodLabel,
  shopLabel,
  secondaryActions,
  overflowActions,
}: PageTopBarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="truncate text-[28px] font-semibold leading-[1.1] text-white sm:text-[30px]">
            {title}
          </h1>
          {subtitle ? <p className="text-sm text-slate-300">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center self-center gap-2 whitespace-nowrap sm:justify-end sm:gap-2.5">
        {overflowActions ? <div className="shrink-0">{overflowActions}</div> : null}

        {timeControl ? (
          <div className="shrink-0">{timeControl}</div>
        ) : periodLabel ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-100">
            {periodLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
