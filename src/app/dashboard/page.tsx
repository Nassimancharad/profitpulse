import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { DashboardProfitDrilldown } from '@/components/DashboardProfitDrilldown';
import { SyncNowButton } from '@/components/SyncNowButton';
import { SyncStatusPanel } from '@/components/SyncStatusPanel';
import { formatShopLabel } from '@/lib/shopLabel';
import { requireAppPageAuth } from '@/lib/auth';
import { buildSetupProgress, type SetupProgress } from '@/lib/setupProgress';
import {
  getCurrencyFormatter,
  getNumberFormatter,
  getPercentFormatter,
  getSharedCurrency,
  normalizeCurrencyCode,
} from '@/lib/currency';
import prisma from '@/lib/prisma';
import { type AdSpendInput } from '@/lib/profit';
import { getAllocatedAdSpendByShop, getAllocatedAdSpendByShopByDate } from '@/lib/portfolioAdSpend';
import { buildDailyKpiSeries } from '@/analytics';
import { addDaysToDateKey, dayBoundsForDateKey, formatDateForTimezone, normalizeShopTimezone, parseDateKey, toTimeZoneDateKey } from '@/lib/timezone';
import { logWarn } from '@/observability';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
  searchParams?: Promise<{ start?: string; end?: string; shop?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const { authorizedShops } = await requireAppPageAuth();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shops: ShopOverview[] = await (async () => {
    try {
      return await prisma.shop.findMany({
        where: { shopDomain: { in: authorizedShops } },
        select: { id: true, shopDomain: true, paymentFeePct: true, paymentFeeFixed: true, currency: true, timezone: true },
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

  const [
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
    syncStates,
  ] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId: { in: shopIds },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        product: {
          select: { costPerUnit: true },
        },
        variant: {
          select: { costPerUnit: true },
        },
      },
    }),
    activeShop
      ? prisma.orderLine.findMany({
          where: {
            order: {
              shopId: activeShop.id,
              createdAt: { gte: startDate, lte: endDate },
            },
          },
          select: {
            id: true,
            orderId: true,
            quantity: true,
            lineRevenue: true,
            product: {
              select: {
                title: true,
                costPerUnit: true,
              },
            },
            variant: {
              select: {
                title: true,
                sku: true,
                costPerUnit: true,
              },
            },
          },
        })
      : Promise.resolve([]),
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
            date: { gte: adSpendStartDateUtc, lte: adSpendEndDateUtc },
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
            shopifyOrderId: true,
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
    useAllocatedAdSpend ? getAllocatedAdSpendByShop(shopIds, startDate, endDate, timezone) : Promise.resolve([]),
    useAllocatedAdSpend ? getAllocatedAdSpendByShopByDate(shopIds, startDate, endDate, timezone) : Promise.resolve([]),
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
    activeShop
      ? prisma.metaAdAccount.count({
          where: { shopId: activeShop.id },
        })
      : Promise.resolve(0),
    activeShop
      ? prisma.product.count({
          where: {
            shopId: activeShop.id,
            costPerUnit: { not: null },
          },
        })
      : Promise.resolve(0),
    activeShop
      ? prisma.syncState.findMany({
          where: { shopId: activeShop.id },
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
    timezone,
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
          variant: {
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
            shopifyOrderId: true,
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
              date: { gte: previousAdSpendStartDateUtc, lte: previousAdSpendEndDateUtc },
            },
            select: { amountSpent: true },
          })
        : Promise.resolve<AdSpendInput[]>([]),
      useAllocatedAdSpend
        ? getAllocatedAdSpendByShopByDate(shopIds, previousStart, previousEnd, timezone)
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
  const hasShopifySync = syncStates.some((state) => {
    return state.resource === 'SHOPIFY' && (state.status === 'OK' || Boolean(state.lastSyncedAt));
  });
  const hasShopifyData = totalOrders > 0 || hasShopifySync;
  const hasCostInputs =
    (activeShop?.paymentFeePct ?? 0) > 0 ||
    (activeShop?.paymentFeeFixed ?? 0) > 0 ||
    productCostCount > 0 ||
    expenses.some((expense) => expense.shopId === null || expense.shopId === activeShop?.id);
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
      {activeShop ? <SyncNowButton shopDomain={activeShop.shopDomain} /> : null}
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

        {setupProgress ? <SetupGuideCard progress={setupProgress} /> : null}

        <KpiStrip items={kpiStripItems} partialData={!hasAdSpend} />

        {activeShop ? (
          <SyncStatusPanel shopDomain={activeShop.shopDomain} states={syncStates} />
        ) : null}

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-8 space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {trendCards.map(({ key, ...card }) => (
                <TrendCard key={key} {...card} />
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
            <Card className="p-5 text-sm text-[color:var(--pp-muted)]">
              Store-level KPIs update daily or near realtime based on connected sources. Use Sync now after ads or product changes.
            </Card>
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
          <Card className="p-5 text-sm text-[color:var(--pp-muted)]">
            Select a single store to drill from daily KPI charts into orders and line-item profit breakdowns.
          </Card>
        )}
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

function SetupGuideCard({ progress }: { progress: SetupProgress }) {
  return (
    <Card className="relative w-full max-w-full p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--pp-foreground)]">Guided setup</div>
          <div className="text-xs text-[color:var(--pp-muted)]">
            {progress.completedSteps} of {progress.totalSteps} completed
          </div>
        </div>
        {progress.isComplete ? (
          <span className="pp-badge border-emerald-300/60 bg-emerald-100/60 text-emerald-700">
            Setup complete
          </span>
        ) : (
          <span className="pp-badge glass-inset text-xs">In progress</span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
        <div
          className="h-full rounded-full bg-[rgba(242,122,40,0.92)] transition-all"
          style={{ width: `${Math.round(progress.completionRatio * 100)}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {progress.steps.map((step, index) => (
          <Link
            key={step.id}
            href={step.href}
            className="rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 transition hover:border-[color:rgba(242,122,40,0.2)] hover:bg-white/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">Step {index + 1}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  step.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {step.complete ? 'Done' : 'Pending'}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--pp-foreground)]">{step.title}</div>
            <div className="mt-1 text-xs text-[color:var(--pp-muted)]">{step.description}</div>
          </Link>
        ))}
      </div>
      {progress.isComplete ? (
        <div className="mt-4 rounded-xl border border-emerald-300/60 bg-emerald-100/50 px-4 py-3 text-sm text-emerald-700">
          Setup complete. Your store is ready for insights with connected data and cost inputs.
        </div>
      ) : null}
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
}: {
  label: string;
  value: string;
  delta: number | null;
  series: number[];
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
        <Sparkline values={series} />
      </div>
    </Card>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <div className="h-10 w-full rounded-lg bg-white/60" />;
  }
  const width = 160;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(242,122,40,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BreakdownList({
  title,
  description,
  items,
  currencyFormatter,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number; hint?: string }>;
  currencyFormatter: Intl.NumberFormat;
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

function DataFreshness({ freshness }: { freshness: Freshness }) {
  const color =
    freshness.status === "fresh"
      ? "bg-emerald-500"
      : freshness.status === "delayed"
        ? "bg-amber-500"
        : freshness.status === "stale"
          ? "bg-rose-500"
          : "bg-neutral-400";
  return (
    <div className="pp-badge glass-inset flex w-full items-center gap-2 px-3.5 py-1.5 text-xs sm:w-auto">
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
