import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthorizedSessionFromCookie } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string; email?: string; logged_out?: string }>;
};

function resolveBanner(error?: string, loggedOut?: string) {
  if (loggedOut === "1") {
    return {
      tone: "success" as const,
      message: "You have been logged out.",
    };
  }

  const messages: Record<string, { tone: "error"; message: string }> = {
    invalid: { tone: "error", message: "This magic link is invalid." },
    expired: { tone: "error", message: "This magic link has expired. Request a new one." },
    used: { tone: "error", message: "This magic link has already been used." },
    no_access: { tone: "error", message: "This account does not have access to any shops yet." },
    missing: { tone: "error", message: "Magic link is missing." },
    rate_limited: { tone: "error", message: "Too many login attempts. Wait a bit before trying again." },
  };

  return error ? messages[error] ?? { tone: "error", message: "Login failed. Try again." } : null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAuthorizedSessionFromCookie();
  if (session.shops.length) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : undefined;
  const banner = resolveBanner(params?.error, params?.logged_out);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--pp-bg)] px-6 py-16 text-[color:var(--pp-foreground)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(242,122,40,0.18),transparent_32%),radial-gradient(circle_at_90%_15%,rgba(255,220,186,0.9),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(246,241,236,0.94))]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.42)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--pp-muted)]">ProfitPulse</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[color:var(--pp-foreground)]">
            Sign in with a magic link
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--pp-muted)]">
            Standalone email accounts use a one-time login link. Shopify embedded sessions stay separate and still bootstrap from Shopify App Bridge tokens.
          </p>

          {banner ? (
            <div
              className={`mt-6 rounded-2xl border p-4 text-sm ${
                banner.tone === "success"
                  ? "border-emerald-300/60 bg-emerald-50/90 text-emerald-800"
                  : "border-rose-300/60 bg-rose-50/90 text-rose-700"
              }`}
            >
              {banner.message}
            </div>
          ) : null}

          <div className="mt-8">
            <LoginForm initialEmail={params?.email ?? ""} />
          </div>

          <p className="mt-6 text-xs text-[color:var(--pp-muted)]">
            Invited but no account yet? Accept your invite first, then use the same email address here.
          </p>
        </section>

        <aside className="rounded-[2rem] border border-[color:var(--pp-border)] bg-[rgba(255,248,242,0.82)] p-8 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.35)]">
          <h2 className="text-lg font-semibold">How this auth split works</h2>
          <div className="mt-5 space-y-4 text-sm text-[color:var(--pp-muted)]">
            <p>
              Shopify session: verified per request from Shopify session tokens, then mapped to shop access and memberships.
            </p>
            <p>
              Standalone session: created only after a one-time email token is consumed, then stored in the app cookie.
            </p>
            <p>
              In both cases, shop access comes from <code>ShopMembership</code>. In <code>shopify_full_access</code>, Shopify sessions are elevated to admin for the connected shop; standalone email users keep their membership role.
            </p>
          </div>
          <div className="mt-8">
            <Link href="/" className="text-sm font-medium text-[color:var(--pp-accent)] underline underline-offset-4">
              Back to home
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
