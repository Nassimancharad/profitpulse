"use client";

import type { ReactNode } from "react";

type PageTopBarProps = {
  title: string;
  subtitle?: string;
  leadingAction?: ReactNode;
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
};

export function PageTopBar({
  title,
  subtitle,
  leadingAction,
  timeControl,
  periodLabel,
  shopLabel,
  secondaryActions,
}: PageTopBarProps) {
  return (
    <div className="flex min-h-10 min-w-0 flex-col justify-center gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex min-h-10 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          {leadingAction ? <div className="flex h-10 items-center">{leadingAction}</div> : null}
          <h1 className="truncate text-[28px] font-semibold leading-[1] text-[color:var(--pp-foreground)] sm:text-[30px]">
            {title}
          </h1>
          {subtitle ? <p className="truncate text-sm text-[color:var(--pp-muted)]">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
        {secondaryActions ? <div className="w-full min-w-0 sm:w-auto">{secondaryActions}</div> : null}

        {timeControl ? (
          <div className="w-full min-w-0 sm:w-auto">{timeControl}</div>
        ) : periodLabel && periodLabel !== "—" ? (
          <span className="pp-badge glass-inset w-full px-3.5 py-1.5 sm:w-auto">
            {periodLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
