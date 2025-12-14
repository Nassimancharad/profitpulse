"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { PageTopBar } from "./PageTopBar";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
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
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeHref = useMemo(() => {
    const match = NAV_ITEMS.find((item) =>
      pathname === "/" ? false : pathname?.startsWith(item.href),
    );
    return match?.href ?? null;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[var(--pp-bg)] text-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/10 bg-white/5 px-4 py-6 backdrop-blur lg:flex">
          <div className="px-2">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
              ProfitPulse
            </p>
            <h1 className="mt-2 text-xl font-semibold text-white">Analytics</h1>
          </div>
          <nav className="mt-8 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10 ${
                    isActive ? "bg-white/10 text-white" : "text-slate-200"
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 bg-[var(--pp-bg)]/85 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.6)] backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-6 sm:px-6 sm:py-6 lg:px-8">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-white transition hover:border-white/30 lg:hidden"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
              >
                ☰
              </button>
              <div className="flex-1">
                <PageTopBar
                  title={title}
                  subtitle={subtitle}
                  timeControl={timeControl}
                  periodLabel={periodLabel}
                  secondaryActions={secondaryActions ?? actions}
                  overflowActions={overflowActions}
                />
              </div>
            </div>
          </header>

          <main className="flex-1 pb-24">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-white/10 bg-[var(--pp-bg)]/95 px-4 py-6 backdrop-blur transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
              ProfitPulse
            </p>
            <p className="text-lg font-semibold text-white">Navigate</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white transition hover:border-white/30"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        <nav className="mt-6 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10 ${
                  isActive ? "bg-white/10 text-white" : "text-slate-200"
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
