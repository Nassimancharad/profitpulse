import { AppShell } from '@/components/AppShell';
import { OverflowMenu } from '@/components/OverflowMenu';
import { SyncNowButton } from '@/components/SyncNowButton';
import prisma from '@/lib/prisma';

export default async function SettingsPage() {
  const shop = await prisma.shop.findFirst({
    include: { metaAdAccounts: true },
  });

  if (!shop) {
    return (
      <AppShell title="Settings" periodLabel="—" shopLabel="No shop">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Connect a shop to manage settings</h2>
          <p className="mt-2 text-sm text-slate-200">
            Install the app and sync a store to view connections and preferences.
          </p>
        </div>
      </AppShell>
    );
  }

  const overflowActions = (
    <OverflowMenu
      shopDomain={shop.shopDomain}
      embeddedHref={`/app?shop=${encodeURIComponent(shop.shopDomain)}`}
      connectionsHref="/settings"
    />
  );

  const installedAt = shop.installedAt
    ? new Date(shop.installedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const metaStatus =
    shop.metaAdAccounts.length > 0
      ? `${shop.metaAdAccounts.length} connected`
      : 'Not connected';

  const connectMetaUrl = `/api/auth/meta/install?shop=${encodeURIComponent(shop.shopDomain)}`;
  const disconnectMetaUrl = `/api/meta/disconnect?shop=${encodeURIComponent(shop.shopDomain)}`;
  const disconnectShopifyUrl = `/api/auth/shopify/disconnect?shop=${encodeURIComponent(shop.shopDomain)}`;

  return (
    <AppShell
      title="Settings"
      periodLabel="—"
      shopLabel={shop.shopDomain}
      overflowActions={overflowActions}
    >
      <div>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Shop</p>
              <h2 className="text-2xl font-semibold text-white">{shop.shopDomain}</h2>
              <p className="text-sm text-slate-300">Installed {installedAt}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SyncNowButton shopDomain={shop.shopDomain} />
            </div>
          </div>
        </section>

        <section className="mt-8 sm:mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Connections</p>
                <h3 className="text-lg font-semibold text-white">Data sources</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <StatusRow
                label="Shopify"
                status={`Connected to ${shop.shopDomain}`}
                tone="success"
                actions={
                  <form action={disconnectShopifyUrl} method="POST">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15"
                    >
                      Disconnect
                    </button>
                  </form>
                }
              />
              <StatusRow
                label="Meta Ads"
                status={metaStatus}
                tone={shop.metaAdAccounts.length > 0 ? 'success' : 'muted'}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {shop.metaAdAccounts.length === 0 ? (
                      <a
                        href={connectMetaUrl}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15"
                      >
                        Connect
                      </a>
                    ) : (
                      <form action={disconnectMetaUrl} method="POST">
                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15"
                        >
                          Disconnect
                        </button>
                      </form>
                    )}
                  </div>
                }
              />
              {shop.metaAdAccounts.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-slate-200">
                  <div className="font-semibold text-white">Connected Meta ad accounts</div>
                  <div className="mt-2 space-y-1">
                    {shop.metaAdAccounts.map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between">
                        <span className="text-white">{acc.name ?? acc.adAccountId}</span>
                        <span className="text-slate-300 text-[11px]">{acc.adAccountId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Data</p>
                <h3 className="text-lg font-semibold text-white">Sync & retention</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div>
                  <div className="font-semibold text-white">Manual sync</div>
                  <div className="text-slate-300">Fetch latest orders and ad spend.</div>
                </div>
                <SyncNowButton shopDomain={shop.shopDomain} />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="font-semibold text-white">Data retention</div>
                <div className="text-slate-300">We keep your data for analytics; contact support to purge.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 sm:mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Preferences</p>
              <h3 className="text-lg font-semibold text-white">Display</h3>
              <p className="text-sm text-slate-300">
                Default currency and timezone are derived from your shop. Contact support to update.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-white">Currency</span>
                <span className="font-semibold text-white">EUR</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white">Timezone</span>
                <span className="font-semibold text-white">Shop default</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatusRow({
  label,
  status,
  tone = 'muted',
  actions,
}: {
  label: string;
  status: string;
  tone?: 'success' | 'muted';
  actions?: React.ReactNode;
}) {
  const badgeColor = tone === 'success' ? 'bg-emerald-400' : 'bg-slate-400';
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${badgeColor}`} />
        <span className="font-semibold">{label}</span>
      </div>
      <div className="flex flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-3">
        <span className="text-slate-200">{status}</span>
        {actions}
      </div>
    </div>
  );
}
