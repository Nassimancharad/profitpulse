import { AppShell } from '@/components/AppShell';
import { ShopInviteStatus } from "@prisma/client";
import { OverflowMenu } from '@/components/OverflowMenu';
import { ShopConnectForm } from '@/components/ShopConnectForm';
import { SyncNowButton } from '@/components/SyncNowButton';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { TeamInvitesPanel } from '@/components/TeamInvitesPanel';
import { requireAppPageAuth } from '@/lib/auth';
import { formatShopLabel } from '@/lib/shopLabel';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type SettingsPageProps = {
  searchParams?: Promise<{ shop?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { authorizedShops } = await requireAppPageAuth();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops = await prisma.shop.findMany({
    where: { shopDomain: { in: authorizedShops } },
    select: { id: true, shopDomain: true },
    orderBy: { installedAt: 'desc' },
  });

  if (!shops.length) {
    return (
      <AppShell title="Settings" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Connect a shop to manage settings</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Install the app and sync a store to view connections and preferences.
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
      <AppShell title="Settings" periodLabel="—" shopLabel="All stores">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Select a store to manage settings</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            You have multiple stores connected. Pick one to edit connections and preferences.
          </p>
          <div className="mt-4 space-y-2">
            {shops.map((shopItem) => (
              <a
                key={shopItem.id}
                href={`/settings?shop=${encodeURIComponent(shopItem.shopDomain)}`}
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

  const shop = await prisma.shop.findUnique({
    where: { id: activeShop.id },
    select: {
      id: true,
      shopDomain: true,
      installedAt: true,
    },
  });

  if (!shop) {
    return (
      <AppShell title="Settings" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Shop not found</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">Select another shop to continue.</p>
        </div>
      </AppShell>
    );
  }
  const canManage = true;
  const invites = await prisma.shopInvite.findMany({
    where: {
      shopId: shop.id,
      status: {
        in: [ShopInviteStatus.PENDING, ShopInviteStatus.ACCEPTED],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
    },
  });

  const overflowActions = (
    <OverflowMenu
      shopDomain={shop.shopDomain}
      canManage={canManage}
    />
  );
  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={shop.shopDomain}
      includeAll={shops.length > 1}
    />
  );

  const installedAt = shop.installedAt
    ? new Date(shop.installedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  return (
    <AppShell
      title="Settings"
      periodLabel="—"
      shopLabel={formatShopLabel(shop.shopDomain)}
      secondaryActions={shopSelector}
      overflowActions={overflowActions}
    >
      <div>
        <section className="pp-card glass-surface p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Shop</p>
              <h2 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">{formatShopLabel(shop.shopDomain)}</h2>
              <p className="text-sm text-[color:var(--pp-muted)]">Installed {installedAt}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SyncNowButton shopDomain={shop.shopDomain} canManage={canManage} />
            </div>
          </div>
        </section>

        <section className="pp-card glass-surface p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Access</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Hybrid access foundation</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                ProfitPulse still uses Shopify access today, while invite records and future shop roles are now stored for the standalone account rollout.
              </p>
            </div>
          </div>
        </section>

        <TeamInvitesPanel
          shopDomain={shop.shopDomain}
          initialInvites={invites.map((invite) => ({
            ...invite,
            expiresAt: invite.expiresAt.toISOString(),
            acceptedAt: invite.acceptedAt?.toISOString() ?? null,
            createdAt: invite.createdAt.toISOString(),
          }))}
        />

      </div>
    </AppShell>
  );
}
