import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import prisma from '@/lib/prisma';
import { getAdSpendPerProduct } from '@/lib/adAttribution';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
});

const numberFormatter = new Intl.NumberFormat('en-US');

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const roasFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

type DashboardProps = {
  searchParams?: { start?: string; end?: string };
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const shop = await prisma.shop.findFirst();

  if (!shop) {
    return (
      <AppShell title="Dashboard" shopLabel="No shop" periodLabel="—">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
          <p className="mt-4 text-slate-200">
            No shop connected yet. Install the app and connect a store to see metrics.
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

  const [orderLines, totalOrders, adSpends, productAdSpends] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId: shop.id,
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        product: true,
      },
    }),
    prisma.order.count({
      where: {
        shopId: shop.id,
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.adSpend.findMany({
      where: {
        shopId: shop.id,
        date: { gte: startDate, lte: endDate },
      },
    }),
    getAdSpendPerProduct(shop.id, startDate, endDate),
  ]);

  const totalRevenue = orderLines.reduce((sum: number, line: { lineRevenue: number }) => sum + line.lineRevenue, 0);
  const totalUnits = orderLines.reduce((sum: number, line: { quantity: number }) => sum + line.quantity, 0);
  const totalCost = orderLines.reduce((sum: number, line: { quantity: number; product?: { costPerUnit?: number | null } | null }) => {
    if (line.product?.costPerUnit != null) {
      return sum + line.quantity * line.product.costPerUnit;
    }
    return sum;
  }, 0);
  const totalAdSpend = adSpends.reduce((sum: number, spend: { amountSpent: number }) => sum + spend.amountSpent, 0);
  const profit = totalRevenue - totalCost - totalAdSpend;
  const profitMargin = totalRevenue > 0 ? profit / totalRevenue : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : null;

  type ProductStats = {
    productId: string;
    title: string;
    imageUrl: string | null;
    revenue: number;
    unitsSold: number;
    cost: number;
    profit: number;
    roas: number | null;
  };

  const productAggregation = new Map<string, ProductStats>();

  for (const line of orderLines) {
    const product = line.product;
    if (!product) continue;

    const existing = productAggregation.get(product.id);
    const lineCost =
      product.costPerUnit != null ? line.quantity * product.costPerUnit : 0;

    const updated: ProductStats = {
      productId: product.id,
      title: product.title,
      imageUrl: product.imageUrl ?? null,
      revenue: (existing?.revenue ?? 0) + line.lineRevenue,
      unitsSold: (existing?.unitsSold ?? 0) + line.quantity,
      cost: (existing?.cost ?? 0) + lineCost,
      profit: (existing?.profit ?? 0) + (line.lineRevenue - lineCost),
      roas: null,
    };

    productAggregation.set(product.id, updated);
  }

  const productSpendMap = new Map<string, number>();
  for (const spend of productAdSpends) {
    productSpendMap.set(spend.productId, spend.totalAdSpend);
  }

  const topProducts = Array.from(productAggregation.values())
    .map((product) => {
      const allocatedAdSpend = productSpendMap.get(product.productId) ?? 0;
      const productRoas = allocatedAdSpend > 0 ? product.revenue / allocatedAdSpend : null;
      const netProfit = product.profit - allocatedAdSpend;
      return {
        ...product,
        profit: netProfit,
        roas: productRoas,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

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
      title="Dashboard"
      shopLabel={shop.shopDomain}
      periodLabel={periodLabel}
      timeControl={timeControl}
      overflowActions={overflowActions}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross revenue in range" />
        <StatCard label="Orders" value={numberFormatter.format(totalOrders)} hint="All statuses" />
        <StatCard label="Cost of goods" value={currencyFormatter.format(totalCost)} hint="Based on cost per unit" />
        <StatCard label="Ad spend" value={currencyFormatter.format(totalAdSpend)} hint="From connected ads" />
        <StatCard label="Profit" value={currencyFormatter.format(profit)} hint={`Margin ${percentFormatter.format(profitMargin)}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Top 5 products</h2>
              <p className="text-sm text-slate-300">Ranked by revenue in the selected period</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              {topProducts.length} tracked
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-slate-200">
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                  <th className="px-4 py-2 font-medium">Units</th>
                  <th className="px-4 py-2 font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Profit</th>
                  <th className="px-4 py-2 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {topProducts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-300" colSpan={5}>
                      No product data for the last 30 days.
                    </td>
                  </tr>
                ) : (
                  topProducts.map((product) => (
                    <tr key={product.productId} className="transition hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductAvatar title={product.title} imageUrl={product.imageUrl} />
                          <div>
                            <div className="font-medium text-white">{product.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {currencyFormatter.format(product.revenue)}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {numberFormatter.format(product.unitsSold)}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {currencyFormatter.format(product.cost)}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {currencyFormatter.format(product.profit)}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {product.roas ? `${roasFormatter.format(product.roas)}x` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-white">Highlights</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-100">
            <Highlight title="Profit margin" value={percentFormatter.format(profitMargin)} />
            <Highlight title="Cost basis" value={currencyFormatter.format(totalCost)} />
            <Highlight title="Ad spend" value={currencyFormatter.format(totalAdSpend)} />
            <Highlight title="Average order value" value={totalOrders ? currencyFormatter.format(totalRevenue / totalOrders) : '—'} />
          </div>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-200">
            Metrics reflect the selected period. Use Sync now after ads or product changes to refresh results.
          </div>
          </div>
        </div>
    </AppShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-h-[190px] flex-col justify-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">{label}</div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      {hint ? <div className="text-sm text-slate-200/80">{hint}</div> : null}
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

function Highlight({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.15em] text-slate-300">{title}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
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
