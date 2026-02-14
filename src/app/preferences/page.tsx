import { AppShell } from "@/components/AppShell";
import { ShopConnectForm } from "@/components/ShopConnectForm";
import { ShopSwitcher } from "@/components/ShopSwitcher";
import { formatShopLabel } from "@/lib/shopLabel";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PreferencesPageProps = {
  searchParams?: Promise<{ shop?: string }>;
};

export default async function PreferencesPage({ searchParams }: PreferencesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops = await prisma.shop.findMany({
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
      </div>
    </AppShell>
  );
}
