import { AppShell } from '@/components/AppShell';
import { SyncNowButton } from '@/components/SyncNowButton';
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

export default async function DashboardPage() {
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

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [orderLines, totalOrders] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId: shop.id,
          createdAt: { gte: since },
        },
      },
      include: {
        product: true,
      },
    }),
    prisma.order.count({
      where: {
        shopId: shop.id,
        createdAt: { gte: since },
      },
    }),
  ]);

  const totalRevenue = orderLines.reduce((sum, line) => sum + line.lineRevenue, 0);
  const totalUnits = orderLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCost = orderLines.reduce((sum, line) => {
    if (line.product?.costPerUnit != null) {
      return sum + line.quantity * line.product.costPerUnit;
    }
    return sum;
  }, 0);
  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? profit / totalRevenue : 0;

  type ProductStats = {
    productId: string;
    title: string;
    imageUrl: string | null;
    revenue: number;
    unitsSold: number;
    cost: number;
    profit: number;
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
    };

    productAggregation.set(product.id, updated);
  }

  const topProducts = Array.from(productAggregation.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const actions = (
    <div className="flex items-center gap-2">
      <SyncNowButton shopDomain={shop.shopDomain} />
      <a
        href={`/app?shop=${encodeURIComponent(shop.shopDomain)}`}
        className="hidden rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-white/40 hover:text-white sm:inline-flex"
      >
        Open embedded
      </a>
    </div>
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle="Store pulse"
      shopLabel={shop.shopDomain}
      periodLabel="Last 30 days"
      actions={actions}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross over last 30 days" />
        <StatCard label="Orders" value={numberFormatter.format(totalOrders)} hint="All statuses" />
        <StatCard label="Units sold" value={numberFormatter.format(totalUnits)} hint="Total items" />
        <StatCard label="Profit" value={currencyFormatter.format(profit)} hint={`Margin ${percentFormatter.format(profitMargin)}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Top products (30 days)</h2>
              <p className="text-sm text-slate-300">Ranked by revenue</p>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-white">Highlights</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-100">
            <Highlight title="Profit margin" value={percentFormatter.format(profitMargin)} />
            <Highlight title="Cost basis" value={currencyFormatter.format(totalCost)} />
            <Highlight title="Average order value" value={totalOrders ? currencyFormatter.format(totalRevenue / totalOrders) : '—'} />
          </div>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-200">
            Metrics reflect the last 30 days from Shopify. Use Sync now to refresh after new orders.
          </div>
        </div>
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

function Highlight({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.15em] text-slate-300">{title}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
