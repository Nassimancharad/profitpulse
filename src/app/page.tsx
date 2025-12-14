import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[var(--pp-bg)] text-slate-50">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,249,255,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(52,211,153,0.12),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]"
        aria-hidden
      />
      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-16 sm:px-10">
        <header className="flex w-full flex-col items-center gap-2 text-center sm:gap-3">
          <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">ProfitPulse</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Profit clarity for Shopify merchants
          </h1>
          <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
            A calm, focused dashboard for revenue, costs, and ad performance. Designed to feel effortless on desktop, iPad, and iPhone.
          </p>
        </header>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-300/30 transition hover:-translate-y-0.5 hover:shadow-cyan-200/50"
          >
            Open dashboard →
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:border-white/40 hover:text-white"
          >
            Embedded view
          </Link>
        </div>

        <section className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-cyan-200/80">
              <span>Snapshot</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-100">
                Live data ready
              </span>
            </div>
            <div className="mt-4 space-y-2 text-slate-100">
              <p className="text-lg font-semibold">See revenue, costs, profit, and ROAS at a glance.</p>
              <p className="text-sm text-slate-300">
                Sync Shopify orders and Meta ad spend, then explore per-product profitability with a calm, translucent UI.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Designed for focus</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-100">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>Works beautifully on desktop, iPad, and iPhone.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                <span>Apple-like glassmorphism with subtle gradients and gentle motion.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-white/70" />
                <span>Clear actions: sync now, adjust date ranges, and dive into products.</span>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
