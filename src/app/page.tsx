import Link from "next/link";
import { redirect } from "next/navigation";

type HomePageProps = {
  searchParams?: Promise<{
    embedded?: string;
    host?: string;
    shop?: string;
    hmac?: string;
    id_token?: string;
    locale?: string;
    session?: string;
    timestamp?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const isEmbedded = params?.embedded === "1" || Boolean(params?.host);

  if (isEmbedded) {
    const nextParams = new URLSearchParams();
    const hasIdToken = typeof params?.id_token === "string" && params.id_token.length > 0;
    const forwardedKeys = hasIdToken
      ? ["shop", "host", "embedded", "id_token", "locale"]
      : ["shop", "host", "embedded", "locale"];

    for (const key of forwardedKeys) {
      const value = params?.[key as keyof typeof params];
      if (typeof value === "string" && value.length > 0) {
        nextParams.set(key, value);
      }
    }

    if (hasIdToken) {
      const query = nextParams.toString();
      redirect(query ? `/api/auth/shopify/embedded-entry?${query}` : "/api/auth/shopify/embedded-entry");
    }

    nextParams.set("auth", "bootstrap");
    const query = nextParams.toString();
    redirect(query ? `/connections?${query}` : "/connections");
  }

  return (
    <div className="relative min-h-screen bg-[var(--pp-bg)] text-[color:var(--pp-foreground)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(242,122,40,0.12),transparent_45%),radial-gradient(circle_at_85%_0%,rgba(255,214,170,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.14),transparent)]"
        aria-hidden
      />
      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-16 sm:px-10">
        <header className="flex w-full flex-col items-center gap-2 text-center sm:gap-3">
          <div className="flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)] ring-1 ring-cyan-200/20">
            <span className="text-sm font-semibold tracking-[0.28em] text-[color:var(--pp-foreground)]">
              ProfitPulse
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-[color:var(--pp-foreground)] sm:text-5xl">
            Profit clarity for Shopify merchants
          </h1>
          <p className="max-w-2xl text-base text-[color:var(--pp-muted)] sm:text-lg">
            A calm, focused dashboard for revenue, costs, and ad performance. Designed to feel effortless on desktop, iPad, and iPhone.
          </p>
        </header>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/dashboard"
            prefetch={false}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-orange-200/60 transition hover:-translate-y-0.5 hover:shadow-orange-300/60"
          >
            Open dashboard →
          </Link>
        </div>

        <section className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="pp-card glass-surface p-6">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">
              <span>Snapshot</span>
              <span className="pp-badge glass-inset px-2 py-1 text-[11px]">
                Live data ready
              </span>
            </div>
            <div className="mt-4 space-y-2 text-[color:var(--pp-foreground)]">
              <p className="text-lg font-semibold">See revenue, costs, profit, and ROAS at a glance.</p>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Sync Shopify orders and Meta ad spend, then explore per-product profitability with a calm, translucent UI.
              </p>
            </div>
          </div>

          <div className="pp-card glass-surface p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">Designed for focus</div>
            <ul className="mt-4 space-y-3 text-sm text-[color:var(--pp-foreground)]">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[color:var(--pp-accent)]" />
                <span>Works beautifully on desktop, iPad, and iPhone.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[rgba(242,122,40,0.6)]" />
                <span>Apple-like glassmorphism with subtle gradients and gentle motion.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[color:var(--pp-muted)]" />
                <span>Clear actions: sync now, adjust date ranges, and dive into products.</span>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
