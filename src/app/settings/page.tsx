import { AppShell } from '@/components/AppShell';
import { ShopInviteStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { OverflowMenu } from '@/components/OverflowMenu';
import { ShopConnectForm } from '@/components/ShopConnectForm';
import { SyncNowButton } from '@/components/SyncNowButton';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { TeamInvitesPanel } from '@/components/TeamInvitesPanel';
import { resolveAppPageAuth, type AppPageSearchParams } from '@/lib/appPageAuth';
import { getShopPlanByDomain } from '@/data/plans';
import { resolveCurrentEmbeddedAppContext, type EmbeddedAppContext } from '@/lib/embeddedAppContext';
import { canUseFeature } from '@/lib/planGate';
import { PLAN_STATUS_OPTIONS, PLAN_TIER_OPTIONS, formatPlanLabel, formatPlanStatus } from '@/lib/planPresentation';
import { formatShopLabel } from '@/lib/shopLabel';
import { listAuthorizedShopOptions, resolveActiveShop } from '@/lib/shopPage';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type SettingsPageProps = {
  searchParams?: Promise<AppPageSearchParams<{ shop?: string; plan?: string }>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { auth, searchParams: resolvedSearchParams } = await resolveAppPageAuth(searchParams, {
    returnTo: "/settings",
  });
  const cookieStore = await cookies();
  const embeddedContext = resolveCurrentEmbeddedAppContext({
    searchParams: resolvedSearchParams,
    cookieHeader: cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
  });
  const { authorizedShops } = auth;
  const shops = await listAuthorizedShopOptions(authorizedShops);

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
  const activeShop = resolveActiveShop(shops, selectedDomain);

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
  const resolvedPlan = (await getShopPlanByDomain(shop.shopDomain)) ?? {
    shopId: shop.id,
    shopDomain: shop.shopDomain,
    planTier: PLAN_TIER_OPTIONS[0],
    planStatus: PLAN_STATUS_OPTIONS[0],
    planUpdatedAt: new Date(),
  };
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
  const planUpdatedAt = new Date(resolvedPlan.planUpdatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const planStatus = resolvedSearchParams?.plan ?? null;
  const featureRows = [
    {
      label: 'Shopify data sync',
      detail: 'Included with every plan.',
      enabled: true,
    },
    {
      label: 'Shopify Payments fee sync',
      detail: 'Requires Standard or Premium.',
      enabled: canUseFeature({
        planTier: resolvedPlan.planTier,
        planStatus: resolvedPlan.planStatus,
        feature: 'SHOPIFY_PAYMENTS_SYNC',
      }).ok,
    },
    {
      label: 'Meta connections, sync, and campaign mapping',
      detail: 'Requires Premium.',
      enabled: canUseFeature({
        planTier: resolvedPlan.planTier,
        planStatus: resolvedPlan.planStatus,
        feature: 'META_CONNECTIONS',
      }).ok,
    },
  ];

  return (
    <AppShell
      title="Settings"
      periodLabel="—"
      shopLabel={formatShopLabel(shop.shopDomain)}
      secondaryActions={shopSelector}
      overflowActions={overflowActions}
    >
      <div>
        {planStatus ? (
          <div className="glass-inset mb-8 rounded-2xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
            {planStatus === 'saved'
              ? 'Plan updated successfully.'
              : planStatus === 'unchanged'
                ? 'Plan already matched the requested state.'
                : 'Plan update completed.'}
          </div>
        ) : null}

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

        <section className="pp-card glass-surface mt-8 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Plan</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Subscription access</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Current plan {resolvedPlan.planTier.toLowerCase()} · {resolvedPlan.planStatus.toLowerCase().replace('_', ' ')} · Updated {planUpdatedAt}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PLAN_TIER_OPTIONS.map((tier) => (
              <form key={tier} action="/api/shop-plan" method="POST">
                <input type="hidden" name="shop" value={shop.shopDomain} />
                <EmbeddedContextInputs context={embeddedContext} />
                <input type="hidden" name="planTier" value={tier} />
                <button
                  type="submit"
                  disabled={resolvedPlan.planTier === tier}
                  className={`pp-btn px-3.5 py-2 text-sm ${
                    resolvedPlan.planTier === tier
                      ? 'border-[color:rgba(242,122,40,0.28)] bg-[rgba(242,122,40,0.12)] text-[color:var(--pp-foreground)]'
                      : 'pp-btn-secondary glass-inset'
                  }`}
                >
                  {tier === resolvedPlan.planTier ? `${formatPlanLabel(tier)} current` : `Switch to ${formatPlanLabel(tier)}`}
                </button>
              </form>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PLAN_STATUS_OPTIONS.map((status) => (
              <form key={status} action="/api/shop-plan" method="POST">
                <input type="hidden" name="shop" value={shop.shopDomain} />
                <EmbeddedContextInputs context={embeddedContext} />
                <input type="hidden" name="planStatus" value={status} />
                <button
                  type="submit"
                  disabled={resolvedPlan.planStatus === status}
                  className={`pp-btn px-3.5 py-2 text-sm ${
                    resolvedPlan.planStatus === status
                      ? 'border-[color:rgba(242,122,40,0.28)] bg-[rgba(242,122,40,0.12)] text-[color:var(--pp-foreground)]'
                      : 'pp-btn-secondary glass-inset'
                  }`}
                >
                  {resolvedPlan.planStatus === status ? `${formatPlanStatus(status)} current` : formatPlanStatus(status)}
                </button>
              </form>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {featureRows.map((feature) => (
              <div
                key={feature.label}
                className="flex items-start justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-[color:var(--pp-foreground)]">{feature.label}</div>
                  <div className="text-[color:var(--pp-muted)]">{feature.detail}</div>
                </div>
                <span className={`text-xs font-semibold uppercase tracking-wide ${feature.enabled ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {feature.enabled ? 'Enabled' : 'Locked'}
                </span>
              </div>
            ))}
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

function EmbeddedContextInputs({ context }: { context: EmbeddedAppContext }) {
  return (
    <>
      {context.host ? <input type="hidden" name="host" value={context.host} /> : null}
      {context.embedded ? <input type="hidden" name="embedded" value={context.embedded} /> : null}
    </>
  );
}
