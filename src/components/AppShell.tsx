"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  isEmbeddedAppContext,
  resolveEmbeddedAppContext,
} from "@/lib/embeddedAppContext";
import { APP_NAV_ITEMS, buildEmbeddedAppHref, resolveActiveAppHref } from "@/lib/appNavigation";
import { PageTopBar } from "./PageTopBar";
import { SessionBootstrap } from "./SessionBootstrap";

type AppShellProps = {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  shopLabel?: string;
  /**
   * Primary control displayed on the right side (e.g. date range picker).
   */
  timeControl?: ReactNode;
  /**
   * Secondary actions such as sync or links.
   */
  secondaryActions?: ReactNode;
  /**
   * Backward-compatibility slot; will render in the secondary area if provided.
   */
  actions?: ReactNode;
  /**
   * Overflow menu / tertiary actions.
   */
  overflowActions?: ReactNode;
  /**
   * Keep the filter/actions row sticky below the header.
   */
  filtersSticky?: boolean;
  children: ReactNode;
};

export function AppShell({
  title,
  subtitle,
  periodLabel = "Last 30 days",
  timeControl,
  secondaryActions,
  actions,
  overflowActions,
  filtersSticky = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const embeddedContext = useMemo(
    () =>
      resolveEmbeddedAppContext({
        searchParams,
        cookieHeader: typeof document !== "undefined" ? document.cookie : null,
      }),
    [searchParams],
  );
  const isEmbedded = isEmbeddedAppContext(embeddedContext);

  const activeHref = useMemo(() => resolveActiveAppHref(pathname), [pathname]);
  const embeddedNavItems = useMemo(
    () =>
      APP_NAV_ITEMS.map((item) => ({
        ...item,
        resolvedHref: buildEmbeddedAppHref(item.href, searchParams, embeddedContext),
      })),
    [embeddedContext, searchParams],
  );

  return (
    <div className="min-h-screen w-full bg-[var(--pp-bg)] text-[color:var(--pp-foreground)]">
      <SessionBootstrap />
      <div className="flex min-h-screen w-full">
        {!isEmbedded ? (
          <aside className="hidden w-64 flex-shrink-0 flex-col bg-[var(--pp-surface-glass-subtle)] px-4 py-6 backdrop-blur lg:flex">
            <div className="rounded-3xl border border-[color:var(--pp-border)] bg-white/70 px-4 py-4 shadow-[0_12px_30px_-18px_rgba(17,18,22,0.35)]">
              <div className="text-lg font-semibold text-[color:var(--pp-foreground)]">
                ProfitPulse
              </div>
            </div>
            <p className="mt-4 px-2 text-xs uppercase tracking-[0.3em] text-[color:var(--pp-muted)]">
              Analytics
            </p>
            <nav className="mt-4 space-y-1">
              {APP_NAV_ITEMS.map((item) => {
                const isActive = activeHref === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/60 ${
                      isActive
                        ? "glass-inset border border-[color:var(--pp-border)] bg-white/70 text-[color:var(--pp-foreground)]"
                        : "text-[color:var(--pp-muted)]"
                    }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto px-2 pt-6">
              <Link
                href="/logout"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--pp-muted)] transition hover:bg-white/60"
              >
                <span>Logout</span>
              </Link>
            </div>
          </aside>
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 bg-[var(--pp-bg)]/80 shadow-[0_12px_30px_-18px_rgba(17,18,22,0.25)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-3 px-4 py-6 sm:px-6 sm:py-6 lg:px-8">
              <div className="min-w-0 flex-1">
                <PageTopBar
                  title={title}
                  subtitle={subtitle}
                  leadingAction={
                    !isEmbedded ? (
                      <button
                        type="button"
                        className="pp-btn pp-btn-secondary glass-inset h-10 w-10 text-lg lg:hidden"
                        aria-label="Open navigation"
                        onClick={() => setMobileNavOpen(true)}
                      >
                        ☰
                      </button>
                    ) : null
                  }
                />
              </div>
            </div>
            {isEmbedded ? (
              <div className="border-t border-[color:var(--pp-border)]/70 px-4 pb-3 pt-2 sm:px-6 lg:px-8">
                <div className="rounded-2xl border border-[color:var(--pp-border)]/80 bg-white/60 px-2 py-2 shadow-[0_14px_30px_-24px_rgba(17,18,22,0.28)] backdrop-blur">
                <nav className="flex gap-1.5 overflow-x-auto pb-1">
                  {embeddedNavItems.map((item) => {
                    const isActive = activeHref === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.resolvedHref}
                        prefetch
                        scroll={false}
                        className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "border border-[color:rgba(242,122,40,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,248,241,0.92))] text-[color:var(--pp-foreground)] shadow-[0_10px_24px_-18px_rgba(242,122,40,0.7)]"
                            : "border border-transparent bg-transparent text-[color:rgba(71,85,105,0.92)] hover:bg-white/72 hover:text-[color:var(--pp-foreground)]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                </div>
              </div>
            ) : null}
          </header>

          <main className="flex-1 pb-24">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {secondaryActions || timeControl || (periodLabel && periodLabel !== "—") ? (
                <div
                  className={`my-6 flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 ${
                    filtersSticky
                      ? "sticky top-20 z-20 rounded-2xl border border-[color:var(--pp-border)] bg-[var(--pp-bg)]/85 px-3 py-3 backdrop-blur"
                      : ""
                  }`}
                >
                  {secondaryActions ?? actions ? (
                    <div className="w-full min-w-0 sm:w-auto">{secondaryActions ?? actions}</div>
                  ) : null}
                  {timeControl ? (
                    <div className="w-full min-w-0 sm:w-auto">{timeControl}</div>
                  ) : null}
                  {overflowActions ? (
                    <div className="w-full min-w-0 sm:w-auto">{overflowActions}</div>
                  ) : null}
                  {!timeControl && periodLabel && periodLabel !== "—" ? (
                    <span className="pp-badge glass-inset w-full px-3.5 py-1.5 sm:w-auto">
                      {periodLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {children}
            </div>
          </main>
        </div>
      </div>

      {!isEmbedded ? (
        <MobileNav
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          activeHref={activeHref}
        />
      ) : null}
    </div>
  );
}

type MobileNavProps = {
  open: boolean;
  onClose: () => void;
  activeHref: string | null;
};

function MobileNav({ open, onClose, activeHref }: MobileNavProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/35 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-[color:var(--pp-border)] bg-[var(--pp-surface-glass-strong)] px-4 py-6 backdrop-blur transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-3">
          <div className="text-base font-semibold text-[color:var(--pp-foreground)]">
            ProfitPulse
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pp-btn pp-btn-secondary glass-inset h-9 w-9 text-sm"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        <nav className="mt-6 space-y-1 pl-2 pr-3">
          {APP_NAV_ITEMS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/60 ${
                  isActive
                    ? "glass-inset border border-[color:var(--pp-border)] bg-white/70 text-[color:var(--pp-foreground)]"
                    : "text-[color:var(--pp-muted)]"
                }`}
                onClick={onClose}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/logout"
            onClick={onClose}
            className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--pp-muted)] transition hover:bg-white/60"
          >
            <span>Logout</span>
          </Link>
        </nav>
      </div>
    </>
  );
}
