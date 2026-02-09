import prisma from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import { SyncNowButton } from '@/components/SyncNowButton';
import { ProductCostEditor } from './ProductCostEditor';
import { ProductCampaignLinker } from './ProductCampaignLinker';

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

type OrderLineWithOrderProduct = {
  id: string;
  quantity: number;
  lineRevenue: number;
  product: { costPerUnit: number | null } | null;
  order: { createdAt: Date; shopifyOrderId: string };
};
type AdSpendAmount = { amountSpent: number };
type CampaignIdRow = { campaignId: string | null };
type LinkedCampaignRow = { campaignId: string };
type MetaCampaignRow = { campaignId: string; name: string | null };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ start?: string; end?: string }>;
};

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { id: productId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!productId) {
    notFound();
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      shop: true,
    },
  });

  if (!product) {
    return (
      <AppShell title="Product" subtitle="Details" shopLabel="Unknown" periodLabel="—">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Product not found</h1>
          <p className="mt-4 text-slate-200">
            We couldn&apos;t find that product. Return to the products list.
          </p>
          <div className="mt-6">
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-white/40 hover:text-white"
              href="/products"
            >
              ← Back to products
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const today = new Date();
  const defaultEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDateParam(resolvedSearchParams?.start) ?? defaultStart;
  const parsedEnd = parseDateParam(resolvedSearchParams?.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  const [orderLines, adSpends, campaignRows, linkedCampaignsRaw]: [
    OrderLineWithOrderProduct[],
    AdSpendAmount[],
    CampaignIdRow[],
    LinkedCampaignRow[],
  ] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        productId: product.id,
        order: { createdAt: { gte: startDate, lte: endDate } },
      },
      include: {
        order: true,
        product: true,
      },
      orderBy: { order: { createdAt: 'desc' } },
    }),
    prisma.adSpend.findMany({
      where: { shopId: product.shopId, date: { gte: startDate, lte: endDate } },
      select: { amountSpent: true },
    }),
    prisma.adSpend.findMany({
      where: { shopId: product.shopId, campaignId: { not: null } },
      select: { campaignId: true },
      distinct: ["campaignId"],
      orderBy: { campaignId: "asc" },
    }),
    prisma.campaignProduct.findMany({
      where: { productId: product.id },
      select: { campaignId: true },
    }),
  ]);

  const campaignMeta: MetaCampaignRow[] = await prisma.metaCampaign.findMany({
    where: { shopId: product.shopId },
    select: { campaignId: true, name: true },
    orderBy: [{ name: "asc" }],
  });

  const totalRevenue = orderLines.reduce((sum, line) => sum + line.lineRevenue, 0);
  const totalUnits = orderLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCost = orderLines.reduce((sum, line) => {
    if (line.product?.costPerUnit != null) {
      return sum + line.quantity * line.product.costPerUnit;
    }
    return sum;
  }, 0);
  const totalAdSpend = adSpends.reduce((sum, spend) => sum + spend.amountSpent, 0);
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : null;
  const linkedCampaigns = linkedCampaignsRaw.map((c) => c.campaignId);
  const availableCampaigns =
    campaignMeta.length > 0
      ? campaignMeta.map((c) => ({
          id: c.campaignId,
          label: c.name || c.campaignId,
        }))
      : campaignRows
          .map((c) => c.campaignId)
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ id, label: id }));
  const profit = totalRevenue - totalCost - totalAdSpend;
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
      shopDomain={product.shop.shopDomain}
    />
  );

  return (
    <AppShell
      title={product.title}
      shopLabel={product.shop.shopDomain}
      periodLabel={periodLabel}
      timeControl={timeControl}
      overflowActions={overflowActions}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute -top-10 right-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-12 top-24 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />

        <header className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">ProfitPulse</p>
            <h1 className="text-2xl font-semibold text-white leading-tight sm:text-4xl">
              {product.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-white/40 hover:text-white"
                href="/products"
              >
                ← Back to products
              </Link>
              <SyncNowButton shopDomain={product.shop.shopDomain} />
            </div>
          </div>
          <ProductAvatar title={product.title} imageUrl={product.imageUrl ?? null} size="lg" />
        </header>

        <section className="relative mt-6 sm:mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross in period" />
          <StatCard label="Units sold" value={numberFormatter.format(totalUnits)} hint="Total items" />
          <StatCard label="Profit" value={currencyFormatter.format(profit)} hint={`Margin ${percentFormatter.format(profitMargin)}`} />
          <StatCard label="Cost / unit" value={product.costPerUnit != null ? currencyFormatter.format(product.costPerUnit) : '—'} hint="Set to improve accuracy" />
        </section>

        <section className="relative mt-6 sm:mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="ROAS"
            value={roas ? `${roasFormatter.format(roas)}x` : '—'}
            hint={roas ? 'Revenue / ad spend' : 'No ad spend for this product'}
          />
        </section>

        <section className="relative mt-6 sm:mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 sm:p-6 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Order lines</h2>
              <p className="text-sm text-slate-300">Most recent first in the selected period</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              {orderLines.length} lines
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-xs sm:text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-slate-200">
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Revenue</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium">Profit</th>
                  <th className="px-3 py-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orderLines.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-300" colSpan={7}>
                      No order lines for this product in this period. Run a sync or adjust the dates.
                    </td>
                  </tr>
                ) : (
                  orderLines.map((line) => {
                    const orderDate = new Date(line.order.createdAt);
                    const lineCost =
                      line.product?.costPerUnit != null ? line.quantity * line.product.costPerUnit : 0;
                    const lineProfit = line.lineRevenue - lineCost;
                    const margin = line.lineRevenue > 0 ? lineProfit / line.lineRevenue : 0;

                    return (
                      <tr key={line.id} className="transition hover:bg-white/5">
                        <td className="px-3 py-2.5 text-slate-100">{line.order.shopifyOrderId}</td>
                        <td className="px-3 py-2.5 text-slate-100">
                          {orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-2.5 text-slate-100">{numberFormatter.format(line.quantity)}</td>
                        <td className="px-3 py-2.5 text-slate-100">{currencyFormatter.format(line.lineRevenue)}</td>
                        <td className="px-3 py-2.5 text-slate-100">{currencyFormatter.format(lineCost)}</td>
                        <td className="px-3 py-2.5 text-slate-100">{currencyFormatter.format(lineProfit)}</td>
                        <td className="px-3 py-2.5 text-slate-100">{percentFormatter.format(margin)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-6 sm:mt-8">
          <ProductCostEditor
            productId={product.id}
            initialCost={product.costPerUnit}
            shopDomain={product.shop.shopDomain}
          />
        </div>

        <div className="mt-6">
          <ProductCampaignLinker
            productId={product.id}
            linkedCampaigns={linkedCampaigns}
            campaigns={availableCampaigns}
            shopDomain={product.shop.shopDomain}
          />
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

function ProductAvatar({ title, imageUrl, size = 'md' }: { title: string; imageUrl: string | null; size?: 'md' | 'lg' }) {
  const fallbackLetter = title?.[0]?.toUpperCase() ?? '?';
  const dimension = size === 'lg' ? 'h-24 w-24' : 'h-12 w-12';

  if (!imageUrl) {
    return (
      <div className={`flex ${dimension} items-center justify-center rounded-lg bg-white/10 text-sm font-semibold text-white`}>
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className={`${dimension} overflow-hidden rounded-lg ring-1 ring-white/20`}>
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
