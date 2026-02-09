"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageTopBar } from "./PageTopBar";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/costs", label: "Costs" },
  { href: "/connections", label: "Connections" },
  { href: "/preferences", label: "Preferences" },
  { href: "/settings", label: "Settings" },
];

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
  shopLabel = "Demo shop",
  timeControl,
  secondaryActions,
  actions,
  overflowActions,
  filtersSticky = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const activeHref = useMemo(() => {
    const match = NAV_ITEMS.find((item) =>
      pathname === "/" ? false : pathname?.startsWith(item.href),
    );
    return match?.href ?? null;
  }, [pathname]);

  useEffect(() => {
    if (!filtersSticky) return;
    let lastY = window.scrollY;
    const threshold = 16;
    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY;
      if (currentY < 8) {
        setFiltersCollapsed(false);
      } else if (delta > threshold) {
        setFiltersCollapsed(true);
      } else if (delta < -threshold) {
        setFiltersCollapsed(false);
      }
      lastY = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [filtersSticky]);

  return (
    <div className="min-h-screen w-full bg-[var(--pp-bg)] text-[color:var(--pp-foreground)]">
      <div className="flex min-h-screen w-full">
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
            {NAV_ITEMS.map((item) => {
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
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 bg-[var(--pp-bg)]/80 shadow-[0_12px_30px_-18px_rgba(17,18,22,0.25)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-3 px-4 py-6 sm:px-6 sm:py-6 lg:px-8">
              <div className="min-w-0 flex-1">
                <PageTopBar
                  title={title}
                  subtitle={subtitle}
                  leadingAction={
                    <button
                      type="button"
                      className="pp-btn pp-btn-secondary glass-inset h-10 w-10 text-lg lg:hidden"
                      aria-label="Open navigation"
                      onClick={() => setMobileNavOpen(true)}
                    >
                      ☰
                    </button>
                  }
                />
              </div>
            </div>
          </header>

          <main className="flex-1 pb-24">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {secondaryActions || timeControl || (periodLabel && periodLabel !== "—") ? (
                <div
                  className={`my-6 flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 ${
                    filtersSticky
                      ? "sticky top-20 z-20 rounded-2xl border border-[color:var(--pp-border)] bg-[var(--pp-bg)]/85 px-3 py-3 backdrop-blur transition-transform duration-200 sm:translate-y-0"
                      : ""
                  } ${filtersCollapsed ? "-translate-y-24 sm:translate-y-0" : ""}`}
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

      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeHref={activeHref}
      />
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
          {NAV_ITEMS.map((item) => {
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
        </nav>
      </div>
    </>
  );
}
