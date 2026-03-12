import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { DashboardProfitDrilldown } from '@/components/DashboardProfitDrilldown';
import {
  BreakdownList,
  DashboardCard,
  DataFreshness,
  InsightsPanel,
  KpiStrip,
  SetupGuideCard,
  TrendCard,
  type Freshness,
  type InsightItem,
  type KpiItem,
} from '@/components/dashboard/DashboardOverview';
import { SyncNowButton } from '@/components/SyncNowButton';
import { SyncStatusPanel } from '@/components/SyncStatusPanel';
import { formatShopLabel } from '@/lib/shopLabel';
import { requireAppPageAuth } from '@/lib/auth';
import { buildSetupProgress } from '@/lib/setupProgress';
import { inferSetupSignals } from '@/lib/setupProgressSignals';
import { fetchDashboardRawData, fetchDashboardShops } from '@/data/dashboard';
import {
  getCurrencyFormatter,
  getNumberFormatter,
  getPercentFormatter,
  getSharedCurrency,
  normalizeCurrencyCode,
} from '@/lib/currency';
import { buildDailyKpiSeries } from '@/analytics';
import { addDaysToDateKey, dayBoundsForDateKey, formatDateForTimezone, normalizeShopTimezone, parseDateKey, toTimeZoneDateKey } from '@/lib/timezone';
import { logWarn } from '@/observability';
import {
  computePortfolioKPIs,
  computeStoreKPIs,
  calculateOrderProfitBreakdown,
  resolveLineCostPerUnit,
  type OrderInput,
  type OrderLineInput,
  type ShopOverview,
} from '@/domain/profit-engine';

export const dynamic = 'force-dynamic';

const numberFormatter = getNumberFormatter();
const percentFormatter = getPercentFormatter('en-US', { maximumFractionDigits: 1 });

type DashboardProps = {
  searchParams?: Promise<{ start?: string; end?: string; shop?: string; login?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const { authorizedShops } = await requireAppPageAuth();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops: ShopOverview[] = await fetchDashboardShops(authorizedShops);

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
  const sharedCurrency = getSharedCurrency(shops.map((shopItem) => shopItem.currency));
  const displayCurrency = activeShop
    ? normalizeCurrencyCode(activeShop.currency)
    : sharedCurrency;
  const currencyFormatter = getCurrencyFormatter({ currency: displayCurrency });

  const timezone = normalizeShopTimezone(activeShop?.timezone);
  const today = new Date();
  const defaultEndDateKey = toTimeZoneDateKey(today, timezone);
  const defaultStartDateKey = addDaysToDateKey(defaultEndDateKey, -29);

  const startDateKey = parseDateKeyParam(resolvedSearchParams?.start) ?? defaultStartDateKey;
  const endDateKey = parseDateKeyParam(resolvedSearchParams?.end) ?? defaultEndDateKey;
  const { start: adSpendStartDateUtc, end: adSpendEndDateUtc } = utcDayBoundsForDateRange(
    startDateKey,
    endDateKey,
  );
  const { start: startDate } = dayBoundsForDateKey(startDateKey, timezone);
  const { end: endDate } = dayBoundsForDateKey(endDateKey, timezone);
  const rangeDays = Math.max(
    1,
    Math.round((Date.UTC(...dateKeyToUtcParts(endDateKey)) - Date.UTC(...dateKeyToUtcParts(startDateKey))) / (24 * 60 * 60 * 1000)) + 1,
  );
  const previousEndDateKey = addDaysToDateKey(startDateKey, -1);
  const previousStartDateKey = addDaysToDateKey(previousEndDateKey, -(rangeDays - 1));
  const { start: previousAdSpendStartDateUtc, end: previousAdSpendEndDateUtc } = utcDayBoundsForDateRange(
    previousStartDateKey,
    previousEndDateKey,
  );
  const { start: previousStart } = dayBoundsForDateKey(previousStartDateKey, timezone);
  const { end: previousEnd } = dayBoundsForDateKey(previousEndDateKey, timezone);
  const comparisonLabel = `vs ${formatDateForTimezone(previousStart, timezone)} – ${formatDateForTimezone(previousEnd, timezone)}`;

  const {
    orderLines,
    drilldownLines,
    totalOrders,
    adSpendsRaw,
    orders,
    shippingCostRules,
    portfolioAdAllocations,
    portfolioAdAllocationsByDate,
    expenses,
    metaAdAccountCount,
    productCostCount,
    variantCostCount,
    hasAnyOrderData,
    syncStates,
    previousOrderLines,
    previousOrders,
    previousAdSpends,
    previousPortfolioAdAllocationsByDate,
  } = await fetchDashboardRawData({
    activeShop,
    shopIds,
    startDate,
    endDate,
    adSpendStartDateUtc,
    adSpendEndDateUtc,
    previousStart,
    previousEnd,
    previousAdSpendStartDateUtc,
    previousAdSpendEndDateUtc,
    timezone,
    useAllocatedAdSpend,
  });

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
    timezone,
  });

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
    timezone,
  });

  const drilldownData = activeShop
    ? (() => {
        const feeConfig = feeConfigByShop.get(activeShop.id) ?? {
          pct: activeShop.paymentFeePct ?? 0,
          fixed: activeShop.paymentFeeFixed ?? 0,
        };
        const drilldownAdSpends = useAllocatedAdSpend
          ? portfolioAdAllocationsByDate
              .filter((allocation) => allocation.shopId === activeShop.id)
              .map((allocation) => ({
                date: allocation.date,
                amountSpent: allocation.amountSpent,
              }))
          : adSpendsRaw.map((item) => ({
              date: item.date,
              amountSpent: item.amountSpent,
            }));

        const orderProfit = calculateOrderProfitBreakdown(
          orders.map((order) => ({
            id: order.id,
            shopifyOrderId: (order as any).shopifyOrderId ?? order.id,
            createdAt: (order as any).createdAt ?? startDate,
            shippingRevenue: (order as any).shippingRevenue ?? 0,
            shippingCost: (order as any).shippingCost ?? null,
            shippingCountryCode: ((order as any).shippingCountryCode ?? null) as string | null,
            refundedProductAmount: (order as any).refundedProductAmount ?? 0,
            refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
            paymentFeeActual: (order as any).paymentFeeActual ?? null,
            paymentFeePct: feeConfig.pct,
            paymentFeeFixed: feeConfig.fixed,
          })),
          orderLines.map((line) => ({
            orderId: line.orderId,
            quantity: line.quantity,
            lineRevenue: line.lineRevenue,
            costPerUnit: resolveLineCostPerUnit({
              variantCostPerUnit: line.variant?.costPerUnit ?? null,
              productCostPerUnit: line.product?.costPerUnit ?? null,
            }),
          })),
          drilldownAdSpends,
          shippingCostRules,
          timezone,
        );

        const shopLabelById = new Map(shops.map((shop) => [shop.id, formatShopLabel(shop.shopDomain)]));

        return {
          orders: orderProfit.orders.map((order) => {
            const sourceOrder = orders.find((candidate) => candidate.id === order.orderId);
            const shopId = (sourceOrder as any)?.shopId ?? activeShop.id;
            return {
              orderId: order.orderId,
              shopifyOrderId: order.shopifyOrderId,
              createdAt: order.createdAt.toISOString(),
              dayKey: toTimeZoneDateKey(order.createdAt, timezone),
              shopLabel: shopLabelById.get(shopId) ?? null,
              netProductRevenue: order.netProductRevenue,
              netShippingRevenue: order.netShippingRevenue,
              cogs: order.cogs,
              shippingCost: order.shippingCost,
              adCostAllocated: order.adCostAllocated,
              paymentFee: order.paymentFee,
              netProfit: order.netProfit,
            };
          }),
          lines: drilldownLines.map((line) => ({
            lineId: line.id,
            orderId: line.orderId,
            quantity: line.quantity,
            lineRevenue: line.lineRevenue,
            costPerUnit: resolveLineCostPerUnit({
              variantCostPerUnit: line.variant?.costPerUnit ?? null,
              productCostPerUnit: line.product?.costPerUnit ?? null,
            }),
            productTitle: line.product?.title ?? "Unknown product",
            variantTitle: line.variant?.title ?? null,
            variantSku: line.variant?.sku ?? null,
          })),
          showShopColumn: shops.length > 1,
        };
      })()
    : null;

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

  const trendCards = [
    {
      key: "revenue",
      label: "Revenue trend",
      value: currencyFormatter.format(totalRevenue),
      delta: calculateDelta(totalRevenue, previousKpis.totals.totalRevenue),
      series: aggregateSeries.revenue,
      format: "currency" as const,
    },
    {
      key: "profit",
      label: "Profit trend",
      value: currencyFormatter.format(profit),
      delta: calculateDelta(profit, previousKpis.totals.profit),
      series: aggregateSeries.profit,
      format: "currency" as const,
    },
    {
      key: "orders",
      label: "Orders trend",
      value: numberFormatter.format(totalOrders),
      delta: calculateDelta(totalOrders, previousOrders.length),
      series: aggregateSeries.orders,
      format: "number" as const,
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
  const { hasShopifyData, hasCostInputs } = inferSetupSignals({
    syncStates,
    hasAnyOrderData,
    paymentFeePct: activeShop?.paymentFeePct,
    paymentFeeFixed: activeShop?.paymentFeeFixed,
    productCostCount,
    variantCostCount,
    expenses,
    activeShopId: activeShop?.id,
  });
  const setupProgress = activeShop
    ? buildSetupProgress({
        shopDomain: activeShop.shopDomain,
        hasShopConnection: true,
        hasShopifyData,
        hasMetaConnection: metaAdAccountCount > 0,
        hasCostInputs,
      })
    : null;

  const freshness = buildFreshness(lastDataAt);

  const periodLabel = `${formatDateForTimezone(startDate, timezone)} – ${formatDateForTimezone(endDate, timezone)}`;

  const timeControl = (
    <TimeRangeSelector
      startDate={startDateKey}
      endDate={endDateKey}
      timezone={timezone}
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
      {activeShop ? (
        <SyncNowButton
          shopDomain={activeShop.shopDomain}
          canManage
        />
      ) : null}
      <span className="pp-badge glass-inset w-full px-3.5 py-1.5 sm:w-auto">
        Comparison: previous period
      </span>
      <DataFreshness freshness={freshness} />
    </div>
  );

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

        {resolvedSearchParams?.login === "magic_link_success" ? (
          <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">
            Magic link verified. Your standalone session is active.
          </div>
        ) : null}

        {setupProgress ? <SetupGuideCard progress={setupProgress} /> : null}

        <KpiStrip items={kpiStripItems} partialData={!hasAdSpend} formatDelta={formatDelta} />

        {activeShop ? (
          <SyncStatusPanel shopDomain={activeShop.shopDomain} states={syncStates} />
        ) : null}

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-8 space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {trendCards.map(({ key, ...card }) => (
                <TrendCard key={key} {...card} formatDelta={formatDelta} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BreakdownList
                title="Revenue breakdown"
                description="Gross revenue, refunds, and fees in the selected period."
                items={revenueBreakdown}
                currencyFormatter={currencyFormatter}
              />
              <BreakdownList
                title="Cost breakdown"
                description="COGS, ads, fees, and expenses in the selected period."
                items={costBreakdown}
                currencyFormatter={currencyFormatter}
              />
            </div>
          </div>
          <div className="col-span-12 xl:col-span-4 space-y-6">
            <InsightsPanel insights={insights} />
            <DashboardCard className="p-5 text-sm text-[color:var(--pp-muted)]">
              Store-level KPIs update daily or near realtime based on connected sources. Use Sync now after ads or product changes.
            </DashboardCard>
          </div>
        </div>

        {activeShop && drilldownData ? (
          <DashboardProfitDrilldown
            dateKeys={dateKeys}
            kpiOptions={KPI_OPTIONS}
            aggregateSeries={aggregateSeries}
            comparisonSeries={previousAggregateSeries}
            comparisonDateKeys={previousDateKeys}
            comparisonLabel={comparisonLabel}
            currency={displayCurrency}
            orders={drilldownData.orders}
            lines={drilldownData.lines}
            showShopColumn={drilldownData.showShopColumn}
          />
        ) : (
          <DashboardCard className="p-5 text-sm text-[color:var(--pp-muted)]">
            Select a single store to drill from daily KPI charts into orders and line-item profit breakdowns.
          </DashboardCard>
        )}
      </div>
    </AppShell>
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

function parseDateKeyParam(value?: string) {
  if (!value) return null;
  return parseDateKey(value) ? value : null;
}

function dateKeyToUtcParts(dateKey: string): [number, number, number] {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    const today = new Date();
    return [today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()];
  }
  return [parsed.year, parsed.month - 1, parsed.day];
}

function utcDayBoundsForDateRange(startDateKey: string, endDateKey: string) {
  const [startYear, startMonthIndex, startDay] = dateKeyToUtcParts(startDateKey);
  const [endYear, endMonthIndex, endDay] = dateKeyToUtcParts(endDateKey);
  const start = new Date(Date.UTC(startYear, startMonthIndex, startDay, 0, 0, 0, 0));
  const end = new Date(Date.UTC(endYear, endMonthIndex, endDay + 1, 0, 0, 0, 0) - 1);
  return { start, end };
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
