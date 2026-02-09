import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { KpiTwoPanelChart } from '@/components/KpiTwoPanelChart';
import { SyncNowButton } from '@/components/SyncNowButton';
import { formatShopLabel } from '@/lib/shopLabel';
import prisma from '@/lib/prisma';
import { calculateCogsForOrder, calculateNetRevenueForOrder, calculatePaymentFeesForOrder, type AdSpendInput } from '@/lib/profit';
import { getAllocatedAdSpendByShop, getAllocatedAdSpendByShopByDate } from '@/lib/portfolioAdSpend';
import { buildDailyKpiSeries } from '@/analytics';
import { logWarn } from '@/observability';
import type { ReactNode } from 'react';
import { resolveShippingCost, type ShippingCostRuleInput } from '@/lib/shippingCost';
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
  const comparisonLabel = `vs ${formatShortDate(previousStart)} – ${formatShortDate(previousEnd)}`;

  const [
    orderLines,
    totalOrders,
    adSpendsRaw,
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
          select: { amountSpent: true, date: true },
        })
      : Promise.resolve<Array<{ amountSpent: number; date: Date }>>([]),
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

  const adSpends = adSpendsRaw.map((item) => ({ amountSpent: item.amountSpent }));
  const hasAdSpend = useAllocatedAdSpend ? portfolioAdAllocations.length > 0 : adSpendsRaw.length > 0;
  const latestOrderAt = orders.reduce<Date | null>((latest, order) => {
    if (!order.createdAt) return latest;
    return !latest || order.createdAt > latest ? order.createdAt : latest;
  }, null);
  const latestAdSpendAt = useAllocatedAdSpend
    ? portfolioAdAllocationsByDate.reduce<Date | null>((latest, item) => {
        return !latest || item.date > latest ? item.date : latest;
      }, null)
    : adSpendsRaw.reduce<Date | null>((latest, item) => {
        return !latest || item.date > latest ? item.date : latest;
      }, null);
  const lastDataAt = [latestOrderAt, latestAdSpendAt].filter(Boolean).sort((a, b) => (a! > b! ? -1 : 1))[0] ?? null;

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

  const totalCosts =
    totalCost + totalAdSpend + totalExpenses + totalPaymentFees + (shippingTotals.shippingCost ?? 0);
  const previousCosts =
    previousKpis.totals.totalCost +
    previousKpis.totals.totalAdSpend +
    previousKpis.totalExpenses +
    previousKpis.totalPaymentFees +
    (previousKpis.shippingTotals.shippingCost ?? 0);

  const kpiStripItems: Array<{
    key: string;
    label: string;
    value: string;
    delta: number | null;
    hint?: string;
  }> = [
    {
      key: "revenue",
      label: "Revenue",
      value: currencyFormatter.format(totalRevenue),
      delta: calculateDelta(totalRevenue, previousKpis.totals.totalRevenue),
      hint: "Gross revenue",
    },
    {
      key: "profit",
      label: "Net profit",
      value: currencyFormatter.format(profit),
      delta: calculateDelta(profit, previousKpis.totals.profit),
      hint: `Margin ${percentFormatter.format(profitMargin)}`,
    },
    {
      key: "costs",
      label: "Costs",
      value: currencyFormatter.format(totalCosts),
      delta: calculateDelta(totalCosts, previousCosts),
      hint: "COGS, ads, fees, expenses",
    },
    {
      key: "roas",
      label: "ROAS",
      value: roas === null ? "—" : `${numberFormatter.format(roas)}x`,
      delta: roas === null ? null : calculateDelta(roas, previousKpis.totals.roas ?? 0),
      hint: "Revenue / ad spend",
    },
    {
      key: "aov",
      label: "AOV",
      value: currencyFormatter.format(averageOrderValue),
      delta: calculateDelta(averageOrderValue, previousKpis.averageOrderValue),
      hint: "Avg order value",
    },
    {
      key: "orders",
      label: "Orders",
      value: numberFormatter.format(totalOrders),
      delta: calculateDelta(totalOrders, previousOrders.length),
      hint: "All statuses",
    },
  ];

  const hourlySeries = rangeDays === 1
    ? buildHourlyKpiSeries({
        orders,
        orderLines,
        shippingCostRules,
        feeConfigByShop,
        startDate,
        totalAdSpend,
        totalExpenses,
      })
    : null;

  const trendSeries = hourlySeries
    ? {
        revenue: hourlySeries.series.revenue,
        profit: hourlySeries.series.profit,
        orders: hourlySeries.series.orders,
      }
    : {
        revenue: aggregateSeries.revenue,
        profit: aggregateSeries.profit,
        orders: aggregateSeries.orders,
      };

  const trendCards = [
    {
      key: "revenue",
      label: "Revenue trend",
      value: currencyFormatter.format(totalRevenue),
      delta: calculateDelta(totalRevenue, previousKpis.totals.totalRevenue),
      series: trendSeries.revenue,
      format: "currency" as const,
      color: "#0ea5e9",
    },
    {
      key: "profit",
      label: "Profit trend",
      value: currencyFormatter.format(profit),
      delta: calculateDelta(profit, previousKpis.totals.profit),
      series: trendSeries.profit,
      format: "currency" as const,
      color: "#f97316",
    },
    {
      key: "orders",
      label: "Orders trend",
      value: numberFormatter.format(totalOrders),
      delta: calculateDelta(totalOrders, previousOrders.length),
      series: trendSeries.orders,
      format: "number" as const,
      color: "#6366f1",
    },
  ];

  const costBreakdown = [
    { label: "Cost of goods", value: totalCost, hint: "Product costs" },
    { label: "Ad spend", value: totalAdSpend, hint: "Connected ad accounts" },
    { label: "Payment fees", value: totalPaymentFees, hint: "Processor fees" },
    { label: "Shipping cost", value: shippingTotals.shippingCost ?? 0, hint: "Carrier costs" },
    { label: "Expenses", value: totalExpenses, hint: "Fixed and variable" },
  ];

  const insights = buildInsights({
    profitMargin,
    roas,
    refundedProductAmount,
    totalRevenue,
    totalOrders,
  });

  const freshness = buildFreshness(lastDataAt);

  const periodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;

  const timeControl = (
    <TimeRangeSelector
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
    />
  );

  const shopSelector = (
    <ShopSwitcher
      shops={shops}
      selectedShopDomain={activeShop?.shopDomain ?? null}
      includeAll={shops.length > 1}
    />
  );
  const secondaryControls = (
    <div className="flex w-full flex-wrap items-center gap-2">
      {shopSelector}
      {activeShop ? <SyncNowButton shopDomain={activeShop.shopDomain} size="lg" /> : null}
      <DataFreshness freshness={freshness} size="lg" />
    </div>
  );

  const chartDateKeys = hourlySeries ? hourlySeries.dateKeys : dateKeys;
  const chartAggregateSeries = hourlySeries ? hourlySeries.series : aggregateSeries;
  const chartComparison =
    hourlySeries && rangeDays === 1
      ? buildHourlyKpiSeries({
          orders: previousOrders as OrderInput[],
          orderLines: previousOrderLines as OrderLineInput[],
          shippingCostRules,
          feeConfigByShop: previousKpis.feeConfigByShop,
          startDate: previousStart,
          totalAdSpend: previousKpis.totals.totalAdSpend,
          totalExpenses: previousKpis.totalExpenses,
        })
      : null;

  return (
    <AppShell
      title="Dashboard"
      shopLabel={activeShop ? formatShopLabel(activeShop.shopDomain) : 'All stores'}
      periodLabel={periodLabel}
      timeControl={timeControl}
      secondaryActions={secondaryControls}
      filtersSticky
    >
      <div className="relative space-y-6">
        <div
          className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-[rgba(242,122,40,0.18)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-10 top-24 h-48 w-48 rounded-full bg-[rgba(255,214,170,0.35)] blur-3xl sm:h-64 sm:w-64"
          aria-hidden
        />

        <KpiStrip items={kpiStripItems} partialData={!hasAdSpend} />

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-8 space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {trendCards.map(({ key, ...card }) => (
                <TrendCard key={key} trendKey={key} {...card} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BreakdownList
                title="Revenue breakdown"
                description="Gross revenue, refunds, and fees in the selected period."
                items={revenueBreakdown}
              />
              <BreakdownList
                title="Cost breakdown"
                description="COGS, ads, fees, and expenses in the selected period."
                items={costBreakdown}
              />
            </div>
          </div>
          <div className="col-span-12 xl:col-span-4 space-y-6">
            <InsightsPanel insights={insights} />
            <Card className="p-5 text-sm text-[color:var(--pp-muted)]">
              Store-level KPIs update daily or near realtime based on connected sources. Use Sync now after ads or product changes.
            </Card>
          </div>
        </div>

        <KpiTwoPanelChart
          dateKeys={chartDateKeys}
          kpiOptions={KPI_OPTIONS}
          aggregateSeries={chartAggregateSeries}
          comparisonSeries={chartComparison ? chartComparison.series : previousAggregateSeries}
          comparisonDateKeys={chartComparison ? chartComparison.dateKeys : previousDateKeys}
          comparisonLabel={comparisonLabel}
          storeSeries={[]}
          defaultSelected={["revenue", "profit", "adSpend"]}
          defaultCompare="revenue"
        />
      </div>
    </AppShell>
  );
}

type KpiItem = {
  key: string;
  label: string;
  value: string;
  delta: number | null;
  hint?: string;
};

type Freshness = {
  status: "fresh" | "delayed" | "stale" | "unknown";
  label: string;
  detail: string;
};

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`pp-card glass-surface ${className}`}>{children}</div>;
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Overview</p>
      <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">{title}</h3>
      {description ? <p className="text-sm text-[color:var(--pp-muted)]">{description}</p> : null}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  const tone =
    delta === null
      ? "text-[color:var(--pp-muted)]"
      : delta >= 0
        ? "text-emerald-600"
        : "text-rose-600";
  return (
    <span className={`rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatDelta(delta)}
    </span>
  );
}

function KpiStrip({ items, partialData }: { items: KpiItem[]; partialData: boolean }) {
  return (
    <Card className="relative w-full max-w-full p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">Key KPIs</div>
        {partialData ? (
          <span className="pp-badge glass-inset text-xs">Partial data</span>
        ) : null}
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <KpiCard key={item.key} item={item} />
        ))}
      </div>
    </Card>
  );
}

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <div className="pp-card glass-surface--subtle min-w-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">{item.label}</div>
        <DeltaBadge delta={item.delta} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-[color:var(--pp-foreground)]">{item.value}</div>
      {item.hint ? <div className="mt-1 text-xs text-[color:var(--pp-muted)]">{item.hint}</div> : null}
    </div>
  );
}

function TrendCard({
  label,
  value,
  delta,
  series,
  color,
  trendKey,
}: {
  label: string;
  value: string;
  delta: number | null;
  series: number[];
  color: string;
  trendKey: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">{label}</div>
          <div className="mt-1 text-lg font-semibold text-[color:var(--pp-foreground)]">{value}</div>
        </div>
        <DeltaBadge delta={delta} />
      </div>
      <div className="mt-3 h-10">
        <Sparkline values={series} color={color} id={`trend-${trendKey}`} />
      </div>
    </Card>
  );
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  if (!values.length) {
    return <div className="h-10 w-full rounded-lg bg-white/60" />;
  }
  const width = 200;
  const height = 40;
  const paddingY = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (width - 12) / (values.length - 1) : width;
  const xOffset = 6;
  const coords = values.map((value, index) => {
    const x = xOffset + index * step;
    const yRaw = height - ((value - min) / range) * height;
    const y = Math.min(height - paddingY, Math.max(paddingY, yRaw));
    return { x, y };
  });
  if (coords.length === 1) {
    coords.push({ x: xOffset + (width - 12), y: coords[0].y });
  }
  const linePath = buildSmoothPath(coords);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-10 w-full">
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const tension = 0.2;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) * tension);
    const cp1y = p1.y + ((p2.y - p0.y) * tension);
    const cp2x = p2.x - ((p3.x - p1.x) * tension);
    const cp2y = p2.y - ((p3.y - p1.y) * tension);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function BreakdownList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number; hint?: string }>;
}) {
  return (
    <Card className="p-5">
      <SectionHeader title={title} description={description} />
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyState title="No data for this period." />
        ) : (
          items.map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--pp-foreground)]">{item.label}</div>
                {item.hint ? <div className="text-xs text-[color:var(--pp-muted)]">{item.hint}</div> : null}
              </div>
              <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">
                {currencyFormatter.format(item.value)}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function InsightsPanel({ insights }: { insights: InsightItem[] }) {
  return (
    <Card className="p-5">
      <SectionHeader
        title="Alerts & insights"
        description="Focus on the biggest changes that need action."
      />
      <div className="mt-4 space-y-3">
        {insights.length === 0 ? (
          <EmptyState title="No alerts right now." />
        ) : (
          insights.map((insight) => <InsightCard key={insight.title} insight={insight} />)
        )}
      </div>
    </Card>
  );
}

type InsightItem = {
  title: string;
  detail: string;
  priority: "High" | "Medium" | "Low";
};

function InsightCard({ insight }: { insight: InsightItem }) {
  const tone =
    insight.priority === "High"
      ? "bg-rose-100 text-rose-700"
      : insight.priority === "Medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  return (
    <div className="rounded-xl border border-[color:var(--pp-border)] bg-white/70 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[color:var(--pp-foreground)]">{insight.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
          {insight.priority}
        </span>
      </div>
      <div className="mt-2 text-xs text-[color:var(--pp-muted)]">{insight.detail}</div>
    </div>
  );
}

function DataFreshness({
  freshness,
  size = "md",
}: {
  freshness: Freshness;
  size?: "md" | "lg";
}) {
  const color =
    freshness.status === "fresh"
      ? "bg-emerald-500"
      : freshness.status === "delayed"
        ? "bg-amber-500"
        : freshness.status === "stale"
          ? "bg-rose-500"
          : "bg-neutral-400";
  const padding = size === "lg" ? "px-4.5 py-2.5" : "px-3.5 py-1.5";
  return (
    <div className={`pp-badge glass-inset flex w-full items-center gap-2 rounded-[var(--pp-radius-button)] ${padding} text-xs sm:w-auto`}>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[color:var(--pp-muted)]">{freshness.label}</span>
      <span className="text-[color:var(--pp-foreground)]">{freshness.detail}</span>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-6 text-center text-sm text-[color:var(--pp-muted)]">
      {title}
    </div>
  );
}

function calculateDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return (current - previous) / Math.abs(previous);
}

function formatDelta(delta: number | null) {
  if (delta === null) return "—";
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${percentFormatter.format(delta)}`;
}

function buildHourlyKpiSeries(input: {
  orders: OrderInput[];
  orderLines: OrderLineInput[];
  shippingCostRules: ShippingCostRuleInput[];
  feeConfigByShop: Map<string, { pct: number; fixed: number }>;
  startDate: Date;
  totalAdSpend: number;
  totalExpenses: number;
}) {
  const hours = Array.from({ length: 24 }, () => 0);
  const revenue = [...hours];
  const profit = [...hours];
  const orders = [...hours];
  const cogs = [...hours];
  const shippingCosts = [...hours];
  const paymentFees = [...hours];
  const adSpend = [...hours];
  const margin = [...hours];
  const roas = [...hours];

  const linesByOrder = new Map<string, OrderLineInput[]>();
  for (const line of input.orderLines) {
    const list = linesByOrder.get(line.orderId) ?? [];
    list.push(line);
    linesByOrder.set(line.orderId, list);
  }

  const rulesByShop = new Map<string, ShippingCostRuleInput[]>();
  for (const rule of input.shippingCostRules) {
    const shopId = (rule as any).shopId as string | undefined;
    if (!shopId) continue;
    const list = rulesByShop.get(shopId) ?? [];
    list.push(rule);
    rulesByShop.set(shopId, list);
  }

  for (const order of input.orders) {
    const createdAt = order.createdAt ?? input.startDate;
    const hour = createdAt.getHours();
    const lines = linesByOrder.get(order.id) ?? [];
    const productRevenue = lines.reduce((sum, line) => sum + line.lineRevenue, 0);
    const orderCogs = calculateCogsForOrder(
      lines.map((line) => ({ quantity: line.quantity, costPerUnit: line.product?.costPerUnit ?? null })),
    );
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
    });
    const orderValue = productRevenue + (order.shippingRevenue ?? 0);
    const shopId = (order as any).shopId as string | undefined;
    const rules = shopId ? rulesByShop.get(shopId) ?? [] : [];
    const resolvedShipping = resolveShippingCost(rules, orderValue, order.shippingCountryCode ?? null);
    const shippingCost = order.shippingCost ?? resolvedShipping?.cost ?? 0;
    const feeConfig = shopId ? input.feeConfigByShop.get(shopId) : undefined;
    const paymentFee = calculatePaymentFeesForOrder({
      netRevenue,
      paymentFeeActual: order.paymentFeeActual ?? null,
      paymentFeePct: feeConfig?.pct ?? 0,
      paymentFeeFixed: feeConfig?.fixed ?? 0,
    });

    revenue[hour] += netRevenue;
    orders[hour] += 1;
    cogs[hour] += orderCogs;
    shippingCosts[hour] += shippingCost;
    paymentFees[hour] += paymentFee;
  }

  const adSpendPerHour = input.totalAdSpend / 24;
  const expensesPerHour = input.totalExpenses / 24;
  for (let hour = 0; hour < 24; hour += 1) {
    adSpend[hour] = adSpendPerHour;
    profit[hour] =
      revenue[hour] - cogs[hour] - shippingCosts[hour] - paymentFees[hour] - adSpendPerHour - expensesPerHour;
    margin[hour] = revenue[hour] > 0 ? profit[hour] / revenue[hour] : 0;
    roas[hour] = adSpendPerHour > 0 ? revenue[hour] / adSpendPerHour : 0;
  }

  const dateKeys = Array.from({ length: 24 }, (_, hour) => {
    const key = new Date(input.startDate);
    key.setHours(hour, 0, 0, 0);
    return key.toISOString();
  });

  return {
    dateKeys,
    series: {
      revenue,
      orders,
      cogs,
      adSpend,
      profit,
      margin,
      roas,
    },
  };
}

function buildInsights(input: {
  profitMargin: number;
  roas: number | null;
  refundedProductAmount: number;
  totalRevenue: number;
  totalOrders: number;
}): InsightItem[] {
  const insights: InsightItem[] = [];
  if (input.profitMargin < 0.1) {
    insights.push({
      title: "Profit margin is low",
      detail: "Margin under 10%. Check pricing, COGS, or ad efficiency.",
      priority: "High",
    });
  }
  if (input.roas !== null && input.roas < 1.5 && input.totalRevenue > 0) {
    insights.push({
      title: "ROAS below target",
      detail: "Ad spend is not returning enough revenue. Review campaigns.",
      priority: "Medium",
    });
  }
  if (input.totalRevenue > 0 && input.refundedProductAmount / input.totalRevenue > 0.05) {
    insights.push({
      title: "Refunds trending high",
      detail: "Refunds exceed 5% of revenue. Investigate product or fulfillment issues.",
      priority: "Medium",
    });
  }
  if (input.totalOrders === 0) {
    insights.push({
      title: "No orders in this range",
      detail: "Try expanding the date range or sync your store data.",
      priority: "Low",
    });
  }
  return insights.slice(0, 3);
}

function buildFreshness(lastDataAt: Date | null): Freshness {
  if (!lastDataAt) {
    return { status: "unknown", label: "Data freshness", detail: "No recent sync" };
  }
  const minutes = Math.round((Date.now() - lastDataAt.getTime()) / 60000);
  if (minutes <= 5) {
    return { status: "fresh", label: "Fresh", detail: `${minutes} min ago` };
  }
  if (minutes <= 60) {
    return { status: "delayed", label: "Delayed", detail: `${minutes} min ago` };
  }
  const hours = Math.round(minutes / 60);
  return { status: "stale", label: "Stale", detail: `${hours}h ago` };
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
