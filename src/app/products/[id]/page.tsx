import prisma from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAppPageAuth } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import { SyncNowButton } from '@/components/SyncNowButton';
import { ProductCostEditor } from './ProductCostEditor';
import { ProductCampaignLinker } from './ProductCampaignLinker';
import { formatShopLabel } from '@/lib/shopLabel';
import { computeLineProfitMetrics, computeProductProfitSummary } from '@/domain/profit-engine';
import { getCurrencyFormatter, getNumberFormatter, getPercentFormatter } from '@/lib/currency';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ start?: string; end?: string }>;
};

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { authorizedShopSet } = await requireAppPageAuth();
  const { id: productId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!productId) {
    notFound();
  }

  const product = await (async () => {
    try {
      return await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          shopId: true,
          title: true,
          imageUrl: true,
          costPerUnit: true,
          variants: {
            select: {
              id: true,
              title: true,
              sku: true,
              costPerUnit: true,
            },
            orderBy: [{ title: 'asc' }, { sku: 'asc' }],
          },
          shop: {
            select: {
              id: true,
              shopDomain: true,
              currency: true,
              timezone: true,
            },
          },
        },
      });
    } catch {
      return prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          shopId: true,
          title: true,
          imageUrl: true,
          costPerUnit: true,
          variants: {
            select: {
              id: true,
              title: true,
              sku: true,
              costPerUnit: true,
            },
            orderBy: [{ title: 'asc' }, { sku: 'asc' }],
          },
          shop: {
            select: {
              id: true,
              shopDomain: true,
              currency: true,
            },
          },
        },
      });
    }
  })();

  if (!product) {
    return (
    <AppShell title="Product" subtitle="Details" shopLabel="Unknown" periodLabel="—">
        <div className="pp-card glass-surface p-10">
          <h1 className="text-3xl font-semibold text-[color:var(--pp-foreground)]">Product not found</h1>
          <p className="mt-4 text-[color:var(--pp-muted)]">
            We couldn&apos;t find that product. Return to the products list.
          </p>
          <div className="mt-6">
            <Link
              className="pp-btn pp-btn-secondary glass-inset px-4 py-2 text-sm"
              href="/products"
            >
              ← Back to products
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }
  if (!authorizedShopSet.has(product.shop.shopDomain)) {
    notFound();
  }
  const canManage = true;

  const currencyFormatter = getCurrencyFormatter({ currency: product.shop.currency });
  const numberFormatter = getNumberFormatter();
  const percentFormatter = getPercentFormatter('en-US', { maximumFractionDigits: 1 });
  const roasFormatter = getNumberFormatter('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });

  const today = new Date();
  const defaultEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDateParam(resolvedSearchParams?.start) ?? defaultStart;
  const parsedEnd = parseDateParam(resolvedSearchParams?.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  const [orderLines, adSpends, campaignRows, linkedCampaignsRaw] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        productId: product.id,
        order: { createdAt: { gte: startDate, lte: endDate } },
      },
      include: {
        order: true,
        product: true,
        variant: true,
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

  let campaignMeta: { campaignId: string; name: string | null }[] = [];
  const metaCampaignClient = (prisma as any).metaCampaign;
  if (metaCampaignClient?.findMany) {
    campaignMeta = await metaCampaignClient.findMany({
      where: { shopId: product.shopId },
      select: { campaignId: true, name: true },
      orderBy: [{ name: "asc" }],
    });
  }

  const lineInputs = orderLines.map((line) => ({
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    costPerUnit: line.variant?.costPerUnit ?? line.product?.costPerUnit ?? null,
  }));
  const { totalRevenue, totalUnits, totalCost, totalAdSpend, profit, profitMargin, roas } =
    computeProductProfitSummary(lineInputs, adSpends);
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
  const periodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;

  const timeControl = (
    <TimeRangeSelector
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
      timezone={(product.shop as { timezone?: string | null }).timezone ?? "UTC"}
    />
  );

  const overflowActions = <OverflowMenu shopDomain={product.shop.shopDomain} canManage={canManage} />;

  return (
    <AppShell
      title={product.title}
      shopLabel={formatShopLabel(product.shop.shopDomain)}
      periodLabel={periodLabel}
      timeControl={timeControl}
      overflowActions={overflowActions}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute -top-10 right-0 h-48 w-48 rounded-full bg-[rgba(242,122,40,0.18)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-12 top-24 h-48 w-48 rounded-full bg-[rgba(255,214,170,0.35)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />

        <header className="pp-card glass-surface relative flex flex-col gap-4 p-4 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">ProfitPulse</p>
            <h1 className="text-2xl font-semibold text-[color:var(--pp-foreground)] leading-tight sm:text-4xl">
              {product.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                className="pp-btn pp-btn-secondary glass-inset px-4 py-2 text-sm"
                href="/products"
              >
                ← Back to products
              </Link>
              <SyncNowButton shopDomain={product.shop.shopDomain} canManage={canManage} />
            </div>
          </div>
          <ProductAvatar title={product.title} imageUrl={product.imageUrl ?? null} size="lg" />
        </header>

        <section className="relative mt-6 sm:mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross in period" />
          <StatCard label="Units sold" value={numberFormatter.format(totalUnits)} hint="Total items" />
          <StatCard
            label="Product profit"
            value={currencyFormatter.format(profit)}
            hint={`Margin ${percentFormatter.format(profitMargin)} · Excludes shipping/fees/expenses`}
          />
          <StatCard label="Cost / unit" value={product.costPerUnit != null ? currencyFormatter.format(product.costPerUnit) : '—'} hint="Set to improve accuracy" />
        </section>

        <section className="relative mt-6 sm:mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="ROAS"
            value={roas ? `${roasFormatter.format(roas)}x` : '—'}
            hint={roas ? 'Revenue / ad spend' : 'No ad spend for this product'}
          />
        </section>

        <section className="pp-card glass-surface relative mt-6 sm:mt-8 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--pp-foreground)] sm:text-xl">Order lines</h2>
              <p className="text-sm text-[color:var(--pp-muted)]">Most recent first in the selected period</p>
            </div>
            <span className="pp-badge glass-inset px-3 py-1 text-xs">
              {orderLines.length} lines
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--pp-border)] bg-white/60">
            <table className="pp-table min-w-full divide-y divide-black/5 text-xs sm:text-sm">
              <thead className="bg-white/70">
                <tr className="text-left text-[color:var(--pp-muted)]">
                  <th className="px-2 py-2 font-medium sm:px-3">Order</th>
                  <th className="px-2 py-2 font-medium sm:px-3">Date</th>
                  <th className="px-2 py-2 font-medium sm:px-3">Qty</th>
                  <th className="px-2 py-2 font-medium sm:px-3">Revenue</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell sm:px-3">Cost</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell sm:px-3">Line profit</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell sm:px-3">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {orderLines.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-[color:var(--pp-muted)]" colSpan={7}>
                      No order lines for this product in this period. Run a sync or adjust the dates.
                    </td>
                  </tr>
                ) : (
                  orderLines.map((line) => {
                    const orderDate = new Date(line.order.createdAt);
                    const { lineCost, lineProfit, margin } = computeLineProfitMetrics({
                      quantity: line.quantity,
                      lineRevenue: line.lineRevenue,
                      costPerUnit: line.variant?.costPerUnit ?? line.product?.costPerUnit ?? null,
                    });

                    return (
                      <tr key={line.id} className="transition hover:bg-white/70">
                        <td className="px-2 py-2.5 text-[color:var(--pp-foreground)] sm:px-3">{line.order.shopifyOrderId}</td>
                        <td className="px-2 py-2.5 text-[color:var(--pp-foreground)] sm:px-3">
                          {orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-2 py-2.5 text-[color:var(--pp-foreground)] sm:px-3">{numberFormatter.format(line.quantity)}</td>
                        <td className="px-2 py-2.5 text-[color:var(--pp-foreground)] sm:px-3">{currencyFormatter.format(line.lineRevenue)}</td>
                        <td className="hidden px-2 py-2.5 text-[color:var(--pp-foreground)] sm:table-cell sm:px-3">{currencyFormatter.format(lineCost)}</td>
                        <td className="hidden px-2 py-2.5 text-[color:var(--pp-foreground)] sm:table-cell sm:px-3">{currencyFormatter.format(lineProfit)}</td>
                        <td className="hidden px-2 py-2.5 text-[color:var(--pp-foreground)] sm:table-cell sm:px-3">{percentFormatter.format(margin)}</td>
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
            canManage={canManage}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              title: variant.title,
              sku: variant.sku,
              initialCost: variant.costPerUnit,
            }))}
          />
        </div>

        <div className="mt-6">
          <ProductCampaignLinker
            productId={product.id}
            linkedCampaigns={linkedCampaigns}
            campaigns={availableCampaigns}
            shopDomain={product.shop.shopDomain}
            canManage={canManage}
          />
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="pp-card glass-surface p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-[color:var(--pp-foreground)]">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[color:var(--pp-muted)]">{hint}</div> : null}
    </div>
  );
}

function ProductAvatar({ title, imageUrl, size = 'md' }: { title: string; imageUrl: string | null; size?: 'md' | 'lg' }) {
  const fallbackLetter = title?.[0]?.toUpperCase() ?? '?';
  const dimension = size === 'lg' ? 'h-24 w-24' : 'h-12 w-12';

  if (!imageUrl) {
    return (
      <div className={`flex ${dimension} items-center justify-center rounded-lg border border-[color:var(--pp-border)] bg-white/70 text-sm font-semibold text-[color:var(--pp-foreground)]`}>
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className={`${dimension} overflow-hidden rounded-lg ring-1 ring-[color:var(--pp-border)]`}>
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
