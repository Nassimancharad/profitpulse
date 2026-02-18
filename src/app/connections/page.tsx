import { AppShell } from "@/components/AppShell";
import { MetaSyncButton } from "@/components/MetaSyncButton";
import { ShopConnectForm } from "@/components/ShopConnectForm";
import { ShopSwitcher } from "@/components/ShopSwitcher";
import { SyncNowButton } from "@/components/SyncNowButton";
import { formatShopLabel } from "@/lib/shopLabel";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ConnectionsPageProps = {
  searchParams?: Promise<{ shop?: string; shopify?: string; meta?: string }>;
};

type StatusTone = "success" | "warning" | "error";

type StatusBanner = {
  tone: StatusTone;
  message: string;
};

function mapStatus(shopify?: string, meta?: string): StatusBanner | null {
  if (shopify) {
    const shopifyMap: Record<string, StatusBanner> = {
      disconnected: { tone: "success", message: "Shopify store disconnected." },
      missing_shop: { tone: "error", message: "Missing shop domain for Shopify disconnect." },
      not_found: { tone: "error", message: "Shopify store not found." },
      invalid_shop: { tone: "error", message: "Enter a valid Shopify domain (mystore.myshopify.com)." },
    };
    return shopifyMap[shopify] ?? { tone: "warning", message: "Shopify action completed." };
  }
  if (meta) {
    const metaMap: Record<string, StatusBanner> = {
      connected: { tone: "success", message: "Meta ad accounts connected." },
      disconnected: { tone: "success", message: "Meta ad accounts disconnected." },
      missing_shop: { tone: "error", message: "Missing shop domain for Meta disconnect." },
      not_found: { tone: "error", message: "Shop not found for Meta disconnect." },
    };
    return metaMap[meta] ?? { tone: "warning", message: "Meta action completed." };
  }
  return null;
}

function bannerClasses(tone: StatusTone) {
  if (tone === "success") return "border-emerald-300/60 bg-emerald-100/60 text-emerald-700";
  if (tone === "error") return "border-rose-300/60 bg-rose-100/60 text-rose-700";
  return "border-amber-300/60 bg-amber-100/60 text-amber-700";
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops = await prisma.shop.findMany({
    select: { id: true, shopDomain: true, installedAt: true },
    orderBy: { installedAt: "desc" },
  });

  if (!shops.length) {
    return (
      <AppShell title="Connections" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Connect your first store</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Install the app in Shopify to start syncing orders and costs.
          </p>
          <ShopConnectForm />
        </div>
      </AppShell>
    );
  }

  const selectedDomain = resolvedSearchParams?.shop ?? null;
  const selectedShop = selectedDomain
    ? shops.find((candidate: { shopDomain: string }) => candidate.shopDomain === selectedDomain) ?? null
    : null;
  const activeShop = selectedShop ?? (shops.length === 1 ? shops[0] : null);

  if (!activeShop) {
    return (
      <AppShell title="Connections" periodLabel="—" shopLabel="All stores">
        <div className="space-y-6">
          <div className="pp-card glass-surface p-6">
            <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Select a store to manage connections</h2>
            <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
              Pick one store to connect Shopify or Meta data sources.
            </p>
            <div className="mt-4 space-y-2">
              {shops.map((shopItem: { id: string; shopDomain: string }) => (
                <a
                  key={shopItem.id}
                href={`/connections?shop=${encodeURIComponent(shopItem.shopDomain)}`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-foreground)] transition hover:border-[color:rgba(242,122,40,0.2)] hover:bg-white/70"
              >
                <span className="font-semibold">{formatShopLabel(shopItem.shopDomain)}</span>
                <span className="text-xs text-[color:var(--pp-muted)]">Manage</span>
              </a>
            ))}
          </div>
          </div>
          <section className="pp-card glass-surface p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Stores</p>
                <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Add another shop</h3>
                <p className="text-sm text-[color:var(--pp-muted)]">
                  Connect additional Shopify stores to build a portfolio view.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ShopConnectForm />
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const shop = await prisma.shop.findUnique({
    where: { id: activeShop.id },
    select: {
      id: true,
      shopDomain: true,
      installedAt: true,
      metaAdAccounts: {
        select: {
          id: true,
          adAccountId: true,
          name: true,
        },
      },
    },
  });

  if (!shop) {
    return (
      <AppShell title="Connections" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Shop not found</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">Select another shop to continue.</p>
        </div>
      </AppShell>
    );
  }

  const installedAt = shop.installedAt
    ? new Date(shop.installedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const banner = mapStatus(resolvedSearchParams?.shopify, resolvedSearchParams?.meta);
  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={shop.shopDomain}
      includeAll={false}
    />
  );

  return (
    <AppShell
      title="Connections"
      periodLabel="—"
      shopLabel={formatShopLabel(shop.shopDomain)}
      secondaryActions={shopSelector}
    >
      <div className="space-y-8">
        {banner ? (
          <div className={`pp-card glass-inset rounded-2xl border px-4 py-3 text-sm ${bannerClasses(banner.tone)}`}>
            {banner.message}
          </div>
        ) : null}

        <section className="pp-card glass-surface p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Shopify</p>
              <h2 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">{formatShopLabel(shop.shopDomain)}</h2>
              <p className="text-sm text-[color:var(--pp-muted)]">Installed {installedAt}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SyncNowButton shopDomain={shop.shopDomain} />
              <form action={`/api/auth/shopify/disconnect?shop=${encodeURIComponent(shop.shopDomain)}`} method="POST">
                <button
                  type="submit"
                  className="pp-btn px-3.5 py-2 text-sm text-rose-600 border-rose-300/60 bg-rose-200/40 hover:border-rose-300"
                >
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="pp-card glass-surface p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Meta Ads</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Ad account connections</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Connect ad accounts to sync daily spend.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/api/auth/meta/install?shop=${encodeURIComponent(shop.shopDomain)}`}
                className="pp-btn pp-btn-primary px-3.5 py-2 text-sm"
              >
                Connect Meta
              </a>
              <MetaSyncButton shopDomain={shop.shopDomain} />
              <form action={`/api/meta/disconnect?shop=${encodeURIComponent(shop.shopDomain)}`} method="POST">
                <button
                  type="submit"
                  className="pp-btn pp-btn-secondary glass-inset px-3.5 py-2 text-sm"
                >
                  Disconnect Meta
                </button>
              </form>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {shop.metaAdAccounts.length ? (
              shop.metaAdAccounts.map((account: { id: string; adAccountId: string; name?: string | null }) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-1 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-foreground)]"
                >
                  <span className="font-semibold">{account.name ?? "Meta ad account"}</span>
                  <span className="text-xs text-[color:var(--pp-muted)]">ID: {account.adAccountId}</span>
                </div>
              ))
            ) : (
              <div className="glass-inset rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
                No Meta ad accounts connected yet.
              </div>
            )}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
