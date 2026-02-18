import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { OverflowMenu } from '@/components/OverflowMenu';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import prisma from '@/lib/prisma';
import { requireAppPageAuth } from '@/lib/auth';
import { formatShopLabel } from '@/lib/shopLabel';
import { getCurrencyFormatter, getSharedCurrency, normalizeCurrencyCode } from '@/lib/currency';
import { computeProductProfitByProductId } from '@/domain/profit-engine';

export const dynamic = 'force-dynamic';

type ProductsPageProps = {
  searchParams?: Promise<{ start?: string; end?: string; shop?: string; q?: string }>;
};

type ShopOverview = {
  id: string;
  shopDomain: string;
  paymentFeePct?: number | null;
  paymentFeeFixed?: number | null;
  currency?: string | null;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { authorizedShops } = await requireAppPageAuth();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops: ShopOverview[] = await (async () => {
    try {
      return await prisma.shop.findMany({
        where: { shopDomain: { in: authorizedShops } },
        select: { id: true, shopDomain: true, paymentFeePct: true, paymentFeeFixed: true, currency: true },
        orderBy: { installedAt: 'desc' },
      });
    } catch {
      return prisma.shop.findMany({
        where: { shopDomain: { in: authorizedShops } },
        select: { id: true, shopDomain: true },
        orderBy: { installedAt: 'desc' },
      });
    }
  })();

  if (!shops.length) {
    return (
      <AppShell title="Products" subtitle="Performance" shopLabel="No shop" periodLabel="—">
        <div className="pp-card glass-surface p-10">
          <h2 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">Connect a shop to view products</h2>
          <p className="mt-3 text-sm text-[color:var(--pp-muted)]">
            Install the app and sync your store to see per-product revenue, cost, and profit.
          </p>
        </div>
      </AppShell>
    );
  }

  const selectedDomain = resolvedSearchParams?.shop ?? null;
  const selectedShop = selectedDomain
    ? shops.find((candidate) => candidate.shopDomain === selectedDomain) ?? null
    : null;
  const activeShop = selectedShop ?? (shops.length === 1 ? shops[0] : null);
  const shopIds = activeShop ? [activeShop.id] : shops.map((shopItem) => shopItem.id);
  const sharedCurrency = getSharedCurrency(shops.map((shopItem) => shopItem.currency));
  const displayCurrency = activeShop
    ? normalizeCurrencyCode(activeShop.currency)
    : sharedCurrency;
  const currencyFormatter = getCurrencyFormatter({ currency: displayCurrency });

  const today = new Date();
  const defaultEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);
  const parsedStart = parseDateParam(resolvedSearchParams?.start) ?? defaultStart;
  const parsedEnd = parseDateParam(resolvedSearchParams?.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  const products = await prisma.product.findMany({
    where: { shopId: { in: shopIds } },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      shopId: true,
    },
    orderBy: { title: 'asc' },
  });

  const orderLines = await prisma.orderLine.findMany({
    where: {
      order: {
        shopId: { in: shopIds },
        createdAt: { gte: startDate, lte: endDate },
      },
    },
    select: {
      productId: true,
      quantity: true,
      lineRevenue: true,
      product: {
        select: { costPerUnit: true },
      },
      variant: {
        select: { costPerUnit: true },
      },
    },
  });

  const profitByProduct = computeProductProfitByProductId(
    orderLines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      lineRevenue: line.lineRevenue,
      costPerUnit: line.variant?.costPerUnit ?? line.product?.costPerUnit ?? null,
    })),
  );

  const query = resolvedSearchParams?.q?.trim().toLowerCase() ?? '';
  const rows = products
    .filter((product) => (query ? product.title.toLowerCase().includes(query) : true))
    .map((product) => ({
      ...product,
      profit: profitByProduct.get(product.id) ?? 0,
    }))
    .sort((a, b) => (b.profit !== a.profit ? b.profit - a.profit : a.title.localeCompare(b.title)));

  const overflowActions = activeShop ? (
    <OverflowMenu shopDomain={activeShop.shopDomain} />
  ) : undefined;
  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={activeShop?.shopDomain ?? null}
      includeAll={shops.length > 1}
    />
  );

  return (
    <AppShell
      title="Products"
      shopLabel={activeShop ? formatShopLabel(activeShop.shopDomain) : 'All stores'}
      periodLabel="All products"
      secondaryActions={shopSelector}
      overflowActions={overflowActions}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-[rgba(242,122,40,0.18)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-10 top-24 h-48 w-48 rounded-full bg-[rgba(255,214,170,0.35)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />

        <div className="pp-card glass-surface relative p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Products</p>
              <h2 className="mt-2 text-xl font-semibold text-[color:var(--pp-foreground)] sm:text-2xl">Product list</h2>
              <p className="mt-1 text-sm text-[color:var(--pp-muted)] leading-relaxed">
                Browse all products and open a product to edit its cost or view details.
              </p>
            </div>
            <span className="pp-badge glass-inset items-center gap-2 px-4 py-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-[color:var(--pp-accent)]" />
              {rows.length} products
            </span>
          </div>
        </div>

        <section className="pp-card glass-surface relative mt-6 sm:mt-8 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)] sm:text-xl">Products</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">Search and open a product to see details</p>
            </div>
            <form className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center" method="GET">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search products"
                className="pp-input h-10 w-full px-3 sm:w-64"
              />
              <button
                type="submit"
                className="pp-btn pp-btn-secondary glass-inset h-10 w-full px-3 text-xs sm:w-auto"
              >
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {rows.length === 0 ? (
              <div className="pp-card glass-surface--subtle p-4 text-sm text-[color:var(--pp-muted)]">
                No products match your search.
              </div>
            ) : (
              rows.map((product, index) => (
                <div key={product.id} className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-[color:var(--pp-muted)]">
                    {index + 1}
                  </div>
                  <Link
                    href={`/products/${product.id}`}
                    className="pp-card glass-surface--subtle flex min-w-0 flex-1 items-center gap-3 p-3 transition hover:text-[color:var(--pp-accent)]"
                  >
                    <ProductAvatar title={product.title} imageUrl={product.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--pp-foreground)]">
                        {product.title}
                      </div>
                      <div className="text-xs text-[color:var(--pp-muted)]">
                        {currencyFormatter.format(product.profit)}
                        {!activeShop ? (
                          <span className="ml-2">
                            • {(() => {
                              const domain = shops.find((shopItem) => shopItem.id === product.shopId)?.shopDomain;
                              return domain ? formatShopLabel(domain) : '—';
                            })()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="pp-table min-w-full divide-y divide-black/5 text-sm">
              <thead>
                <tr className="text-left text-[color:var(--pp-muted)]">
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Product profit</th>
                  {!activeShop ? (
                    <th className="px-3 py-2 font-medium">Store</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-[color:var(--pp-muted)]" colSpan={activeShop ? 3 : 4}>
                      No products match your search.
                    </td>
                  </tr>
                ) : (
                  rows.map((product, index) => (
                    <tr key={product.id} className="transition hover:bg-white/60">
                      <td className="px-3 py-2.5 text-[color:var(--pp-muted)]">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/products/${product.id}`}
                          className="flex items-center gap-3 transition hover:text-[color:var(--pp-accent)]"
                        >
                          <ProductAvatar title={product.title} imageUrl={product.imageUrl} />
                          <div>
                            <div className="font-medium text-[color:var(--pp-foreground)]">{product.title}</div>
                            <div className="text-xs text-[color:var(--pp-muted)]">View details</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">
                        {currencyFormatter.format(product.profit)}
                      </td>
                      {!activeShop ? (
                        <td className="px-3 py-2.5 text-[color:var(--pp-muted)]">
                          {(() => {
                            const domain = shops.find((shopItem) => shopItem.id === product.shopId)?.shopDomain;
                            return domain ? formatShopLabel(domain) : '—';
                          })()}
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </AppShell>
  );
}

function ProductAvatar({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  const fallbackLetter = title?.[0]?.toUpperCase() ?? '?';

  if (!imageUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[color:var(--pp-border)] bg-white/70 text-sm font-semibold text-[color:var(--pp-foreground)]">
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-[color:var(--pp-border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={title}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function parseDateParam(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atStartOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atEndOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
