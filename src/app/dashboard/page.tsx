import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { KpiTwoPanelChart } from '@/components/KpiTwoPanelChart';
import { formatShopLabel } from '@/lib/shopLabel';
import prisma from '@/lib/prisma';
import { type AdSpendInput } from '@/lib/profit';
import { getAllocatedAdSpendByShop, getAllocatedAdSpendByShopByDate } from '@/lib/portfolioAdSpend';
import { buildDailyKpiSeries } from '@/analytics';
import { logWarn } from '@/observability';
import {
  computePortfolioKPIs,
  computeStoreKPIs,
  type OrderInput,
  type OrderLineInput,
  type ShopOverview,
} from '@/domain/profit-engine';

export const dynamic = 'force-dynamic';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
});

const numberFormatter = new Intl.NumberFormat('en-US');

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});


type DashboardProps = {
  searchParams?: Promise<{ start?: string; end?: string; shop?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops: ShopOverview[] = await (async () => {
    try {
      return await prisma.shop.findMany({
        select: { id: true, shopDomain: true, paymentFeePct: true, paymentFeeFixed: true },
        orderBy: { installedAt: 'desc' },
      });
    } catch {
      return prisma.shop.findMany({
        select: { id: true, shopDomain: true },
        orderBy: { installedAt: 'desc' },
      });
    }
  })();

  if (!shops.length) {
    return (
      <AppShell title="Dashboard" shopLabel="No shop" periodLabel="—">
        <div className="pp-card glass-surface p-10">
          <h1 className="text-3xl font-semibold text-[color:var(--pp-foreground)]">Dashboard</h1>
          <p className="mt-4 text-[color:var(--pp-muted)]">
            No shop connected yet. Install the app and connect a store to see metrics.
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
  const useAllocatedAdSpend = shops.length > 1;
  const shopIds = activeShop ? [activeShop.id] : shops.map((shopItem) => shopItem.id);

  const today = new Date();
  const defaultEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDateParam(resolvedSearchParams?.start) ?? defaultStart;
  const parsedEnd = parseDateParam(resolvedSearchParams?.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);
  const rangeDays = Math.max(
    1,
    Math.round((atStartOfDay(endDate).getTime() - atStartOfDay(startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const previousEnd = atEndOfDay(new Date(startDate.getTime() - 24 * 60 * 60 * 1000));
  const previousStart = atStartOfDay(new Date(previousEnd.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000));
  const comparisonLabel = "";

  const [
    orderLines,
    totalOrders,
    adSpends,
    orders,
    shippingCostRules,
    portfolioAdAllocations,
    portfolioAdAllocationsByDate,
    expenses,
  ] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId: { in: shopIds },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        product: true,
      },
    }),
    prisma.order.count({
      where: {
        shopId: { in: shopIds },
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    activeShop && !useAllocatedAdSpend
      ? prisma.adSpend.findMany({
          where: {
            shopId: activeShop.id,
            date: { gte: startDate, lte: endDate },
          },
          select: { amountSpent: true },
        })
      : Promise.resolve<AdSpendInput[]>([]),
    (async () => {
      try {
        return await prisma.order.findMany({
          where: {
            shopId: { in: shopIds },
            createdAt: { gte: startDate, lte: endDate },
          },
          select: {
            id: true,
            shopId: true,
            createdAt: true,
            shippingRevenue: true,
            shippingCost: true,
            shippingCountryCode: true,
            refundedProductAmount: true,
            refundedShippingAmount: true,
            paymentFeeActual: true,
          },
        });
      } catch {
        return prisma.order.findMany({
          where: {
            shopId: { in: shopIds },
            createdAt: { gte: startDate, lte: endDate },
          },
          select: { id: true, shopId: true, createdAt: true },
        });
      }
    })(),
    (prisma as any).shippingCostRule?.findMany
      ? (prisma as any).shippingCostRule.findMany({
          where: { shopId: { in: shopIds } },
          select: {
            id: true,
            shopId: true,
            countryCode: true,
            minOrderValue: true,
            maxOrderValue: true,
            costAmount: true,
          },
        })
      : [],
    useAllocatedAdSpend ? getAllocatedAdSpendByShop(shopIds, startDate, endDate) : Promise.resolve([]),
    useAllocatedAdSpend ? getAllocatedAdSpendByShopByDate(shopIds, startDate, endDate) : Promise.resolve([]),
    (prisma as any).expense?.findMany
      ? (prisma as any).expense.findMany({
          where: {
            OR: [
              { shopId: { in: shopIds } },
              { shopId: null },
            ],
          },
          select: {
            id: true,
            shopId: true,
            amount: true,
            frequency: true,
            startDate: true,
            endDate: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const kpiData = {
    shops,
    orders: orders as OrderInput[],
    orderLines: orderLines as OrderLineInput[],
    shippingCostRules,
    adSpends,
    useAllocatedAdSpend,
    portfolioAdAllocations,
    expenses: expenses as Array<{
      shopId: string | null;
      amount: number;
      frequency: string;
      startDate: Date;
      endDate: Date | null;
    }>,
    totalOrders,
  };

  const kpis = activeShop
    ? computeStoreKPIs({ start: startDate, end: endDate }, activeShop.id, kpiData)
    : computePortfolioKPIs({ start: startDate, end: endDate }, null, kpiData);

  const {
    totals: { totalRevenue, totalUnits, totalCost, totalAdSpend, profit, profitMargin, roas },
    refundedProductAmount,
    shippingTotals,
    totalPaymentFees,
    totalExpenses,
    netRevenueByShop,
    expenseAllocations,
    feeConfigByShop,
    averageOrderValue,
    netRevenueAfterFees,
  } = kpis;

  if (shippingTotals.warnings.length > 0) {
    logWarn("shipping_totals_warning", { warnings: shippingTotals.warnings });
  }

  const revenueBreakdown = [
    {
      label: "Net revenue (after refunds)",
      value: totalRevenue,
      hint: "Products + shipping after refunds",
    },
    {
      label: "Average order value",
      value: averageOrderValue,
      hint: "Gross revenue / orders",
    },
    {
      label: "Refunds",
      value: refundedProductAmount,
      hint: "Product refunds",
    },
    {
      label: "Shipping revenue",
      value: shippingTotals.shippingRevenue,
      hint: "Included in gross",
    },
    {
      label: "Shipping cost",
      value: shippingTotals.shippingCost ?? 0,
      hint: "Carrier costs",
    },
    {
      label: "Payment fees",
      value: totalPaymentFees,
      hint: "Processor fees",
    },
    {
      label: "Net revenue (after fees)",
      value: netRevenueAfterFees,
      hint: "After payment fees & shipping costs",
    },
  ];

  const { dateKeys, aggregateSeries, storeSeries } = buildDailyKpiSeries({
    startDate,
    endDate,
    shopIds,
    shops,
    activeShopId: activeShop?.id ?? null,
    orders,
    orderLines,
    shippingCostRules,
    adSpends,
    useAllocatedAdSpend,
    portfolioAdAllocationsByDate,
    expenseAllocations,
    netRevenueByShop,
    feeConfigByShop,
  });

  const [previousOrderLines, previousOrders, previousAdSpends, previousPortfolioAdAllocationsByDate] =
    await Promise.all([
      prisma.orderLine.findMany({
        where: {
          order: {
            shopId: { in: shopIds },
            createdAt: { gte: previousStart, lte: previousEnd },
          },
        },
        select: {
          orderId: true,
          quantity: true,
          lineRevenue: true,
          product: {
            select: { costPerUnit: true },
          },
        },
      }),
      (async () => {
        try {
          return await prisma.order.findMany({
            where: {
              shopId: { in: shopIds },
              createdAt: { gte: previousStart, lte: previousEnd },
            },
            select: {
              id: true,
              shopId: true,
              createdAt: true,
              shippingRevenue: true,
              shippingCost: true,
              shippingCountryCode: true,
              refundedProductAmount: true,
              refundedShippingAmount: true,
              paymentFeeActual: true,
            },
          });
        } catch {
          return prisma.order.findMany({
            where: {
              shopId: { in: shopIds },
              createdAt: { gte: previousStart, lte: previousEnd },
            },
            select: { id: true, shopId: true, createdAt: true },
          });
        }
      })(),
      activeShop && !useAllocatedAdSpend
        ? prisma.adSpend.findMany({
            where: {
              shopId: activeShop.id,
              date: { gte: previousStart, lte: previousEnd },
            },
            select: { amountSpent: true },
          })
        : Promise.resolve<AdSpendInput[]>([]),
      useAllocatedAdSpend
        ? getAllocatedAdSpendByShopByDate(shopIds, previousStart, previousEnd)
        : Promise.resolve([]),
    ]);

  const previousKpis = activeShop
    ? computeStoreKPIs(
        { start: previousStart, end: previousEnd },
        activeShop.id,
        {
          ...kpiData,
          orders: previousOrders as OrderInput[],
          orderLines: previousOrderLines as OrderLineInput[],
          adSpends: previousAdSpends,
          portfolioAdAllocations: previousPortfolioAdAllocationsByDate.map((allocation) => ({
            shopId: allocation.shopId,
            totalAdSpend: allocation.amountSpent,
          })),
          totalOrders: previousOrders.length,
        },
      )
    : computePortfolioKPIs(
        { start: previousStart, end: previousEnd },
        null,
        {
          ...kpiData,
          orders: previousOrders as OrderInput[],
          orderLines: previousOrderLines as OrderLineInput[],
          adSpends: previousAdSpends,
          portfolioAdAllocations: previousPortfolioAdAllocationsByDate.map((allocation) => ({
            shopId: allocation.shopId,
            totalAdSpend: allocation.amountSpent,
          })),
          totalOrders: previousOrders.length,
        },
      );
  const { aggregateSeries: previousAggregateSeries, dateKeys: previousDateKeys } = buildDailyKpiSeries({
    startDate: previousStart,
    endDate: previousEnd,
    shopIds,
    shops,
    activeShopId: activeShop?.id ?? null,
    orders: previousOrders,
    orderLines: previousOrderLines,
    shippingCostRules,
    adSpends: previousAdSpends,
    useAllocatedAdSpend,
    portfolioAdAllocationsByDate: previousPortfolioAdAllocationsByDate,
    expenseAllocations: previousKpis.expenseAllocations,
    netRevenueByShop: previousKpis.netRevenueByShop,
    feeConfigByShop: previousKpis.feeConfigByShop,
  });

  const periodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;

  const timeControl = (
    <TimeRangeSelector
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
    />
  );

  const overflowActions = activeShop ? (
    <OverflowMenu
      shopDomain={activeShop.shopDomain}
    />
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
      title="Dashboard"
      shopLabel={activeShop ? formatShopLabel(activeShop.shopDomain) : 'All stores'}
      periodLabel={periodLabel}
      timeControl={timeControl}
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

        <div className="pp-card glass-surface relative w-full max-w-full p-4 sm:p-6">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} hint="Gross revenue in range" />
            <StatCard label="Orders" value={numberFormatter.format(totalOrders)} hint="All statuses" />
            <StatCard label="Cost of goods" value={currencyFormatter.format(totalCost)} hint="Based on cost per unit" />
            <StatCard label="Ad spend" value={currencyFormatter.format(totalAdSpend)} hint="From connected ads" />
            <StatCard label="Net profit" value={currencyFormatter.format(profit)} hint={`Margin ${percentFormatter.format(profitMargin)}`} />
          </div>
        </div>
        <div className="pp-card glass-surface--subtle mt-6 p-5 text-sm text-[color:var(--pp-muted)]">
          Store-level KPIs reflect the selected period. Use Sync now after ads or product changes to refresh results.
        </div>
        <section className="pp-card glass-surface mt-6 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Revenue</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Revenue breakdown</h3>
              <p className="text-sm text-[color:var(--pp-muted)]">
                Summary of gross revenue, refunds, and fees for the selected period.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {revenueBreakdown.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[color:var(--pp-foreground)]">{item.label}</div>
                  <div className="text-xs text-[color:var(--pp-muted)]">{item.hint}</div>
                </div>
                <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">
                  {currencyFormatter.format(item.value)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <KpiTwoPanelChart
          dateKeys={dateKeys}
          kpiOptions={KPI_OPTIONS}
          aggregateSeries={aggregateSeries}
          comparisonSeries={previousAggregateSeries}
          comparisonDateKeys={previousDateKeys}
          comparisonLabel={comparisonLabel}
          storeSeries={[]}
          defaultSelected={["revenue", "profit", "adSpend"]}
          defaultCompare="revenue"
        />
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="pp-card glass-surface--subtle min-w-0 p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-[color:var(--pp-foreground)]">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[color:var(--pp-muted)]">{hint}</div> : null}
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

const KPI_OPTIONS: Array<{ key: "revenue" | "orders" | "cogs" | "adSpend" | "profit" | "margin" | "roas"; label: string; format: "currency" | "number" | "percent" | "ratio" }> = [
  { key: "revenue", label: "Revenue", format: "currency" },
  { key: "orders", label: "Orders", format: "number" },
  { key: "cogs", label: "COGS", format: "currency" },
  { key: "adSpend", label: "Ad spend", format: "currency" },
  { key: "profit", label: "Net profit", format: "currency" },
  { key: "margin", label: "Margin", format: "percent" },
  { key: "roas", label: "ROAS", format: "ratio" },
];
