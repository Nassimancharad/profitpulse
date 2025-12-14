import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import prisma from '@/lib/prisma';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
});

const numberFormatter = new Intl.NumberFormat('en-US');

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

type ProductsPageProps = {
  searchParams?: { start?: string; end?: string };
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const shop = await prisma.shop.findFirst();

  if (!shop) {
    return (
      <AppShell title="Products" subtitle="Performance" shopLabel="No shop" periodLabel="—">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur">
          <h2 className="text-2xl font-semibold text-white">Connect a shop to view products</h2>
          <p className="mt-3 text-sm text-slate-300">
            Install the app and sync your store to see per-product revenue, cost, and profit.
          </p>
        </div>
      </AppShell>
    );
  }

  const today = new Date();
  const defaultEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDateParam(searchParams?.start) ?? defaultStart;
  const parsedEnd = parseDateParam(searchParams?.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  const [products, orderLines] = await Promise.all([
    prisma.product.findMany({
      where: { shopId: shop.id },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        costPerUnit: true,
      },
    }),
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId: shop.id,
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      select: {
        productId: true,
        quantity: true,
        lineRevenue: true,
        product: {
          select: {
            costPerUnit: true,
          },
        },
      },
    }),
  ]);

  type ProductStats = {
    productId: string;
    title: string;
    imageUrl: string | null;
    costPerUnit: number | null;
    revenue: number;
    unitsSold: number;
    cost: number;
    profit: number;
  };

  const statsMap = new Map<string, ProductStats>();

  for (const product of products) {
    statsMap.set(product.id, {
      productId: product.id,
      title: product.title,
      imageUrl: product.imageUrl ?? null,
      costPerUnit: product.costPerUnit ?? null,
      revenue: 0,
      unitsSold: 0,
      cost: 0,
      profit: 0,
    });
  }

  for (const line of orderLines) {
    const stat = statsMap.get(line.productId);
    if (!stat) continue;
    const lineCost =
      line.product?.costPerUnit != null ? line.quantity * line.product.costPerUnit : 0;
    stat.revenue += line.lineRevenue;
    stat.unitsSold += line.quantity;
    stat.cost += lineCost;
    stat.profit += line.lineRevenue - lineCost;
  }

  const rows = Array.from(statsMap.values()).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = rows.reduce((sum, p) => sum + p.revenue, 0);
  const totalCost = rows.reduce((sum, p) => sum + p.cost, 0);
  const totalUnits = rows.reduce((sum, p) => sum + p.unitsSold, 0);
  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? profit / totalRevenue : 0;
  const periodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;

  const timeControl = (
    <TimeRangeSelector
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
    />
  );

  const overflowActions = (
    <OverflowMenu
      shopDomain={shop.shopDomain}
      embeddedHref={`/app?shop=${encodeURIComponent(shop.shopDomain)}`}
      connectionsHref="/settings"
    />
  );

  return (
    <AppShell
      title="Products"
      shopLabel={shop.shopDomain}
      periodLabel={periodLabel}
      timeControl={timeControl}
      overflowActions={overflowActions}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-10 top-24 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />

        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Product overview</p>
              <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Profitability snapshot</h2>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                Revenue, units, profit, and cost basis across the selected period.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {rows.length} products tracked
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross in period" />
            <StatCard label="Units sold" value={numberFormatter.format(totalUnits)} hint="Total items" />
            <StatCard label="Profit" value={currencyFormatter.format(profit)} hint={`Margin ${percentFormatter.format(profitMargin)}`} />
            <StatCard label="Cost basis" value={currencyFormatter.format(totalCost)} hint="Based on cost per unit" />
          </div>
        </div>

        <section className="relative mt-6 sm:mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 sm:p-6 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white sm:text-xl">Product performance</h3>
              <p className="text-sm text-slate-300">Ordered by revenue · tap rows for details</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              {rows.length} products
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-slate-200">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Units</th>
                  <th className="px-3 py-2 font-medium">Revenue</th>
                  <th className="px-3 py-2 font-medium">Cost basis</th>
                  <th className="px-3 py-2 font-medium">Profit</th>
                  <th className="px-3 py-2 font-medium">Margin</th>
                  <th className="px-3 py-2 font-medium">Cost / unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-300" colSpan={7}>
                      No product data for this period. Run a sync or adjust the dates.
                    </td>
                  </tr>
                ) : (
                  rows.map((product) => {
                    const margin = product.revenue > 0 ? product.profit / product.revenue : 0;
                    return (
                      <tr key={product.productId} className="transition hover:bg-white/5">
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/products/${product.productId}`}
                            className="flex items-center gap-3 hover:text-cyan-200 transition"
                          >
                            <ProductAvatar title={product.title} imageUrl={product.imageUrl} />
                            <div>
                              <div className="font-medium text-white">{product.title}</div>
                              <div className="text-xs text-slate-300">View details</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {numberFormatter.format(product.unitsSold)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {currencyFormatter.format(product.revenue)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {currencyFormatter.format(product.cost)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {currencyFormatter.format(product.profit)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {percentFormatter.format(margin)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {product.costPerUnit != null ? currencyFormatter.format(product.costPerUnit) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </AppShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-sm text-slate-200/80">{hint}</div> : null}
    </div>
  );
}

function ProductAvatar({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  const fallbackLetter = title?.[0]?.toUpperCase() ?? '?';

  if (!imageUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold text-white">
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-white/20">
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

function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
