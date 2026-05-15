import { AppShell } from '@/components/AppShell';
import { OverflowMenu } from '@/components/OverflowMenu';
import { SyncNowButton } from '@/components/SyncNowButton';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { resolveAppPageAuth, type AppPageSearchParams } from '@/lib/appPageAuth';
import { getShopPlanByDomain } from '@/data/plans';
import { canUseFeature } from '@/lib/planGate';
import { formatPlanLabel, formatPlanStatus } from '@/lib/planPresentation';
import { formatShopLabel } from '@/lib/shopLabel';
import { listAuthorizedShopOptions, resolveActiveShop, type AuthorizedShopOption } from '@/lib/shopPage';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type CostsPageProps = {
  searchParams?: Promise<AppPageSearchParams<{ shop?: string; payments?: string }>>;
};

type ExpenseRecord = {
  id: string;
  name: string;
  amount: number;
  shopId: string | null;
};

export default async function CostsPage({ searchParams }: CostsPageProps) {
  const { auth, searchParams: resolvedSearchParams } = await resolveAppPageAuth(searchParams, {
    returnTo: "/costs",
  });
  const { authorizedShops } = auth;
  const shops: AuthorizedShopOption[] = await listAuthorizedShopOptions(authorizedShops);

  if (!shops.length) {
    return (
      <AppShell title="Costs" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Connect a shop to manage costs</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Install the app and sync a store to manage fees and expenses.
          </p>
        </div>
      </AppShell>
    );
  }

  const selectedDomain = resolvedSearchParams?.shop ?? null;
  const activeShop = resolveActiveShop(shops, selectedDomain);

  if (!activeShop) {
    return (
      <AppShell title="Costs" periodLabel="—" shopLabel="All stores">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Select a store to manage costs</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">
            Pick a store to edit processor fees or recurring expenses.
          </p>
          <div className="mt-4 space-y-2">
            {shops.map((shopItem) => (
              <a
                key={shopItem.id}
                href={`/costs?shop=${encodeURIComponent(shopItem.shopDomain)}`}
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
      paymentFeePct: true,
      paymentFeeFixed: true,
    },
  });

  if (!shop) {
    return (
      <AppShell title="Costs" periodLabel="—" shopLabel="No shop">
        <div className="pp-card glass-surface p-6">
          <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Shop not found</h2>
          <p className="mt-2 text-sm text-[color:var(--pp-muted)]">Select another shop to continue.</p>
        </div>
      </AppShell>
    );
  }

  const expenses: ExpenseRecord[] = (prisma as any).expense?.findMany
    ? await (prisma as any).expense.findMany({
        where: {
          OR: [{ shopId: shop.id }, { shopId: null }],
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const overflowActions = (
    <OverflowMenu
      shopDomain={shop.shopDomain}
      canManage
    />
  );
  const canManage = true;
  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={shop.shopDomain}
      includeAll={shops.length > 1}
    />
  );
  const paymentsStatus = resolvedSearchParams?.payments ?? null;
  const resolvedPlan = (await getShopPlanByDomain(shop.shopDomain)) ?? {
    shopId: shop.id,
    shopDomain: shop.shopDomain,
    planTier: 'FREE' as const,
    planStatus: 'ACTIVE' as const,
    planUpdatedAt: new Date(),
  };
  const paymentsAccess = canUseFeature({
    planTier: resolvedPlan.planTier,
    planStatus: resolvedPlan.planStatus,
    feature: 'SHOPIFY_PAYMENTS_SYNC',
  });
  const paymentsMessages: Record<string, string> = {
    synced: 'Shopify Payments fees synced successfully.',
    unsupported: 'Shopify Payments is not enabled on this store. Fee sync is unavailable.',
    plan_upgrade_required: 'Your current plan does not include Shopify Payments sync. Upgrade your plan to continue.',
    plan_inactive: 'Your subscription is inactive. Reactivate your plan to use Shopify Payments sync.',
    not_found: 'No billing plan found for this store. Choose a plan to enable Shopify Payments sync.',
  };

  return (
    <AppShell
      title="Costs"
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
              <p className="text-sm text-[color:var(--pp-muted)]">Manage cost settings</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SyncNowButton shopDomain={shop.shopDomain} canManage={canManage} />
            </div>
          </div>
        </section>

        <section className="pp-card glass-surface mt-8 sm:mt-10 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Payments</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Processor fees</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Applied to net revenue after refunds. Current plan {formatPlanLabel(resolvedPlan.planTier)} · {formatPlanStatus(resolvedPlan.planStatus)}.
              </p>
            </div>
          </div>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" action="/api/shop-settings" method="POST">
            <input type="hidden" name="shop" value={shop.shopDomain} />
            <label className="text-xs text-[color:var(--pp-muted)]">
              Fee percent
              <input
                type="number"
                name="paymentFeePct"
                step="0.01"
                min="0"
                defaultValue={shop.paymentFeePct ?? 0}
                disabled={!canManage}
                className="pp-input mt-1"
              />
            </label>
            <label className="text-xs text-[color:var(--pp-muted)]">
              Fixed fee
              <input
                type="number"
                name="paymentFeeFixed"
                step="0.01"
                min="0"
                defaultValue={shop.paymentFeeFixed ?? 0}
                disabled={!canManage}
                className="pp-input mt-1"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!canManage}
                className="pp-btn pp-btn-primary w-full px-4 py-2 text-sm"
              >
                {canManage ? "Save fees" : "Unavailable"}
              </button>
            </div>
          </form>
          <form className="mt-4" action={`/api/shopify-payments/sync?shop=${encodeURIComponent(shop.shopDomain)}`} method="POST">
            <button
              type="submit"
              disabled={!canManage || !paymentsAccess.ok}
              className="pp-btn pp-btn-secondary glass-inset px-4 py-2 text-xs"
            >
              {canManage && paymentsAccess.ok ? "Sync Shopify Payments fees" : "Unavailable"}
            </button>
          </form>
          {!paymentsAccess.ok ? (
            <div className="glass-inset mt-3 rounded-xl border border-amber-300/60 bg-amber-100/60 px-4 py-3 text-xs text-amber-700">
              {paymentsAccess.reason === 'plan_inactive'
                ? 'Shopify Payments sync is disabled because the subscription is inactive. Reactivate the plan in Settings.'
                : 'Shopify Payments sync requires the Standard plan or above. Upgrade the store plan in Settings to unlock it.'}
            </div>
          ) : null}
          {paymentsStatus ? (
            <div className="glass-inset mt-3 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-xs text-[color:var(--pp-muted)]">
              {paymentsMessages[paymentsStatus] ?? 'Shopify Payments sync failed. Please retry after confirming access.'}
            </div>
          ) : null}
        </section>

        <section className="pp-card glass-surface mt-8 sm:mt-10 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Expenses</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Recurring monthly costs</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Allocated proportionally into the reporting period.
              </p>
            </div>
          </div>

          <form className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5" action="/api/expenses" method="POST">
            <input type="hidden" name="shop" value={shop.shopDomain} />
            <label className="text-xs text-[color:var(--pp-muted)] lg:col-span-2">
              Name
              <input
                type="text"
                name="name"
                placeholder="e.g. Subscription tools"
                className="pp-input mt-1"
                disabled={!canManage}
                required
              />
            </label>
            <label className="text-xs text-[color:var(--pp-muted)]">
              Amount (monthly)
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0"
                className="pp-input mt-1"
                disabled={!canManage}
                required
              />
            </label>
            <label className="text-xs text-[color:var(--pp-muted)]">
              Start date
              <input
                type="date"
                name="startDate"
                className="pp-input mt-1"
                disabled={!canManage}
                required
              />
            </label>
            <label className="text-xs text-[color:var(--pp-muted)]">
              End date (optional)
              <input
                type="date"
                name="endDate"
                className="pp-input mt-1"
                disabled={!canManage}
              />
            </label>
            <label className="text-xs text-[color:var(--pp-muted)]">
              Scope
              <select
                name="scope"
                className="pp-select mt-1"
                defaultValue="store"
                disabled={!canManage}
              >
                <option value="store">This store</option>
                <option value="portfolio">All stores</option>
              </select>
            </label>
            <div className="flex items-end lg:col-span-5">
              <button
                type="submit"
                disabled={!canManage}
                className="pp-btn pp-btn-primary w-full px-4 py-2 text-sm"
              >
                {canManage ? "Add expense" : "Unavailable"}
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {expenses.length === 0 ? (
              <div className="glass-inset rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
                No recurring expenses added yet.
              </div>
            ) : (
              expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex flex-col gap-2 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-foreground)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-[color:var(--pp-foreground)]">{expense.name}</div>
                    <div className="text-xs text-[color:var(--pp-muted)]">
                      {expense.shopId ? 'This store' : 'All stores'} · {expense.amount} / month
                    </div>
                  </div>
                  <form
                    action={`/api/expenses?delete=1&id=${encodeURIComponent(expense.id)}&shop=${encodeURIComponent(shop.shopDomain)}`}
                    method="POST"
                  >
                    <button
                      type="submit"
                      disabled={!canManage}
                      className="pp-btn pp-btn-secondary glass-inset px-3 py-2 text-xs"
                    >
                      {canManage ? "Remove" : "Unavailable"}
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
