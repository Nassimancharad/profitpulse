import { AppShell } from "@/components/AppShell";
import { ShopConnectForm } from "@/components/ShopConnectForm";
import { ShopSwitcher } from "@/components/ShopSwitcher";
import { listActiveStandaloneSessions } from "@/lib/appSessions";
import { resolveAppPageAuth, type AppPageSearchParams } from "@/lib/appPageAuth";
import { formatShopLabel } from "@/lib/shopLabel";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PreferencesPageProps = {
  searchParams?: Promise<AppPageSearchParams<{ shop?: string; sessions?: string }>>;
};

function formatDeviceLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Macintosh")) return "Mac";
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Android")) return "Android device";
  return "Browser session";
}

export default async function PreferencesPage({ searchParams }: PreferencesPageProps) {
  const { auth, searchParams: resolvedSearchParams } = await resolveAppPageAuth(searchParams, {
    returnTo: "/preferences",
  });
  const { authorizedShops, sessionKind, actorUserId, sessionId } = auth;
  const standaloneSessions =
    sessionKind === "standalone" && actorUserId ? await listActiveStandaloneSessions(actorUserId) : [];
  const shops = await prisma.shop.findMany({
    where: { shopDomain: { in: authorizedShops } },
    select: { id: true, shopDomain: true },
    orderBy: { installedAt: "desc" },
  });

  if (!shops.length) {
    return (
      <AppShell title="Preferences" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">
            Connect a shop to manage preferences
          </h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Install the app and sync a store to unlock preference settings.
          </p>
          <ShopConnectForm />
        </div>
      </AppShell>
    );
  }

  const selectedDomain = resolvedSearchParams?.shop ?? null;
  const selectedShop = selectedDomain
    ? shops.find((candidate) => candidate.shopDomain === selectedDomain) ?? null
    : null;
  const activeShop = selectedShop ?? (shops.length === 1 ? shops[0] : null);

  if (!activeShop) {
    return (
      <AppShell title="Preferences" periodLabel="—" shopLabel="All stores">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">
            Select a store to manage preferences
          </h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Choose the store you want to personalize.
          </p>
          <div className="mt-4 space-y-2">
            {shops.map((shopItem) => (
              <a
                key={shopItem.id}
                href={`/preferences?shop=${encodeURIComponent(shopItem.shopDomain)}`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-foreground)] transition hover:border-[color:rgba(242,122,40,0.2)] hover:bg-white/70"
              >
                <span className="font-semibold">{formatShopLabel(shopItem.shopDomain)}</span>
                <span className="text-xs text-[color:var(--pp-muted)]">Manage</span>
              </a>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={activeShop.shopDomain}
      includeAll={shops.length > 1}
    />
  );

  return (
    <AppShell
      title="Preferences"
      periodLabel="—"
      shopLabel={formatShopLabel(activeShop.shopDomain)}
      secondaryActions={shopSelector}
    >
      <div className="space-y-6">
        {resolvedSearchParams?.sessions === "others_revoked" ? (
          <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">
            Other devices have been signed out.
          </div>
        ) : null}
        {resolvedSearchParams?.sessions === "session_revoked" ? (
          <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">
            Session revoked.
          </div>
        ) : null}
        <section className="pp-card glass-surface p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">
                Store
              </p>
              <h2 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">
                {formatShopLabel(activeShop.shopDomain)}
              </h2>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Preferences apply to this store only.
              </p>
            </div>
          </div>
        </section>

        <section className="pp-card glass-surface--subtle p-6">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">
              Preferences
            </h3>
            <p className="mt-1 text-sm text-[color:var(--pp-muted)]">
              Preference controls will appear here as you connect more data sources.
            </p>
          </div>
        </section>

        {sessionKind === "standalone" ? (
          <section className="pp-card glass-surface p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Signed-in devices</h3>
                <p className="mt-1 text-sm text-[color:var(--pp-muted)]">
                  Active standalone sessions are stored server-side, so you can revoke this device or other active devices.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action="/api/auth/sessions/revoke" method="POST">
                  <input type="hidden" name="action" value="revoke_others" />
                  <button type="submit" className="pp-btn px-3 py-2 text-sm">
                    Sign out other devices
                  </button>
                </form>
                <form action="/api/auth/sessions/revoke" method="POST">
                  <input type="hidden" name="action" value="revoke_all" />
                  <button type="submit" className="pp-btn px-3 py-2 text-sm text-rose-700 border-rose-300/60 bg-rose-100/60 hover:border-rose-300">
                    Sign out all devices
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {standaloneSessions.map((appSession) => {
                const isCurrent = appSession.id === sessionId;
                const isRevoked = Boolean(appSession.revokedAt);
                const isExpired = appSession.expiresAt < new Date();
                return (
                  <div
                    key={appSession.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[color:var(--pp-border)] bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[color:var(--pp-foreground)]">{formatDeviceLabel(appSession.userAgent)}</p>
                        {isCurrent ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Current</span>
                        ) : null}
                        {isRevoked ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Revoked</span>
                        ) : null}
                        {!isRevoked && isExpired ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Expired</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-[color:var(--pp-muted)]">
                        Last active {appSession.lastSeenAt.toLocaleString("en-US")} • Expires {appSession.expiresAt.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1 truncate text-xs text-[color:var(--pp-muted)]">
                        {appSession.ipAddress ? `IP ${appSession.ipAddress}` : "IP unavailable"}
                        {appSession.userAgent ? ` • ${appSession.userAgent}` : ""}
                      </p>
                    </div>
                    {!isRevoked && !isExpired ? (
                      <form action="/api/auth/sessions/revoke" method="POST">
                        <input type="hidden" name="action" value="revoke_one" />
                        <input type="hidden" name="sessionId" value={appSession.id} />
                        <button
                          type="submit"
                          className={`pp-btn px-3 py-2 text-sm ${
                            isCurrent
                              ? "text-rose-700 border-rose-300/60 bg-rose-100/60 hover:border-rose-300"
                              : ""
                          }`}
                        >
                          {isCurrent ? "Sign out this device" : "Revoke device"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
