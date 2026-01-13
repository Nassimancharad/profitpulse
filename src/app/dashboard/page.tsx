import { AppShell } from '@/components/AppShell';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { OverflowMenu } from '@/components/OverflowMenu';
import { ShopSwitcher } from '@/components/ShopSwitcher';
import { KpiTwoPanelChart } from '@/components/KpiTwoPanelChart';
import { formatShopLabel } from '@/lib/shopLabel';
import prisma from '@/lib/prisma';
import { calculateProfitTotals, type AdSpendInput } from '@/lib/profit';
import { calculateShippingTotals } from '@/lib/shippingCost';
import { getAllocatedAdSpendByShop, getAllocatedAdSpendByShopByDate } from '@/lib/portfolioAdSpend';
import { calculatePaymentFee } from '@/lib/paymentFees';
import { allocateMonthlyExpenses, getTotalExpensesForView } from '@/lib/expenses';
import { buildSeriesForRange } from '@/lib/dashboardSeries';

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

type ShopOverview = {
  id: string;
  shopDomain: string;
  paymentFeePct?: number | null;
  paymentFeeFixed?: number | null;
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

  const lineInputs = orderLines.map((line) => ({
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    costPerUnit: line.product?.costPerUnit ?? null,
  }));
  const orderRevenueMap = buildOrderRevenueMap(orderLines);
  const refundedProductAmount = orders.reduce(
    (sum, order) => sum + ((order as any).refundedProductAmount ?? 0),
    0,
  );
  const netRevenueByShop = buildNetRevenueByShop(orders, orderRevenueMap, activeShop?.id ?? null);
  const expenseAllocations = allocateMonthlyExpenses(
    (expenses as Array<{
      shopId: string | null;
      amount: number;
      frequency: string;
      startDate: Date;
      endDate: Date | null;
    }>),
    startDate,
    endDate,
  );
  const totalExpenses = getTotalExpensesForView(
    expenseAllocations,
    netRevenueByShop,
    activeShop?.id ?? null,
  );
  const feeConfigByShop = new Map<string, { pct: number; fixed: number }>();
  for (const shopItem of shops) {
    feeConfigByShop.set(shopItem.id, {
      pct: shopItem.paymentFeePct ?? 0,
      fixed: shopItem.paymentFeeFixed ?? 0,
    });
  }
  const totalPaymentFees = orders.reduce((sum, order) => {
    const orderId = order.id;
    const shopId = (order as any).shopId ?? activeShop?.id;
    if (!shopId) return sum;
    const actualFee = (order as any).paymentFeeActual ?? null;
    if (actualFee != null) {
      return sum + actualFee;
    }
    const feeConfig = feeConfigByShop.get(shopId) ?? { pct: 0, fixed: 0 };
    const productRevenue = orderRevenueMap.get(orderId) ?? 0;
    const refundedProduct = (order as any).refundedProductAmount ?? 0;
    const refundedShipping = (order as any).refundedShippingAmount ?? 0;
    const shippingRevenue = (order as any).shippingRevenue ?? 0;
    const netProductRevenue = Math.max(0, productRevenue - refundedProduct);
    const netShippingRevenue = Math.max(0, shippingRevenue - refundedShipping);
    const netRevenue = netProductRevenue + netShippingRevenue;
    return sum + calculatePaymentFee(netRevenue, feeConfig.pct, feeConfig.fixed);
  }, 0);
  let shippingTotals = { shippingRevenue: 0, shippingCost: 0, shippingMargin: 0, warnings: [] as string[] };
  if (activeShop) {
    const shippingOrders = orders.map((order) => ({
      id: order.id,
      orderValue: (orderRevenueMap.get(order.id) ?? 0) + ((order as any).shippingRevenue ?? 0),
      shippingRevenue: (order as any).shippingRevenue ?? 0,
      refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
      shippingCost: (order as any).shippingCost ?? null,
      shippingCountryCode: ((order as any).shippingCountryCode ?? null) as string | null,
    }));
    shippingTotals = calculateShippingTotals(shippingOrders, shippingCostRules);
  } else {
    for (const shopItem of shops) {
      const shopOrders = orders.filter((order) => (order as any).shopId === shopItem.id);
      const shopRules = shippingCostRules.filter((rule) => (rule as any).shopId === shopItem.id);
      const shippingOrders = shopOrders.map((order) => ({
        id: order.id,
        orderValue: (orderRevenueMap.get(order.id) ?? 0) + ((order as any).shippingRevenue ?? 0),
        shippingRevenue: (order as any).shippingRevenue ?? 0,
        refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
        shippingCost: (order as any).shippingCost ?? null,
        shippingCountryCode: ((order as any).shippingCountryCode ?? null) as string | null,
      }));
      const shopTotals = calculateShippingTotals(shippingOrders, shopRules);
      shippingTotals.shippingRevenue += shopTotals.shippingRevenue;
      shippingTotals.shippingCost += shopTotals.shippingCost;
      shippingTotals.shippingMargin += shopTotals.shippingMargin;
      if (shopTotals.warnings.length > 0) {
        shippingTotals.warnings.push(...shopTotals.warnings);
      }
    }
  }
  if (shippingTotals.warnings.length > 0) {
    console.warn(`[shipping] ${shippingTotals.warnings.join(' ')}`);
  }
  let allocatedAdSpends: AdSpendInput[] = adSpends;
  let allocationMap: Map<string, number> | null = null;
  if (useAllocatedAdSpend) {
    allocationMap = new Map<string, number>();
    for (const allocation of portfolioAdAllocations) {
      allocationMap.set(allocation.shopId, allocation.totalAdSpend);
    }
    const totalAllocated = activeShop
      ? allocationMap.get(activeShop.id) ?? 0
      : portfolioAdAllocations.reduce((sum, allocation) => sum + allocation.totalAdSpend, 0);
    allocatedAdSpends = totalAllocated ? [{ amountSpent: totalAllocated }] : [];
  }
  const { totalRevenue, totalUnits, totalCost, totalAdSpend, profit, profitMargin, roas } =
    calculateProfitTotals(
      lineInputs,
      allocatedAdSpends,
      {
        shippingRevenue: shippingTotals.shippingRevenue,
        shippingCost: shippingTotals.shippingCost,
      },
      {
        refundedProductAmount,
      },
      {
        paymentFees: totalPaymentFees,
      },
      {
        expenses: totalExpenses,
      },
    );

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
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
      value:
        totalRevenue -
        totalPaymentFees -
        (shippingTotals.shippingCost ?? 0),
      hint: "After payment fees & shipping costs",
    },
  ];

  const { dateKeys, aggregateSeries, storeSeries } = buildSeriesForRange({
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

  const previousOrderRevenueMap = buildOrderRevenueMap(previousOrderLines);
  const previousNetRevenueByShop = buildNetRevenueByShop(
    previousOrders,
    previousOrderRevenueMap,
    activeShop?.id ?? null,
  );
  const previousExpenseAllocations = allocateMonthlyExpenses(
    (expenses as Array<{
      shopId: string | null;
      amount: number;
      frequency: string;
      startDate: Date;
      endDate: Date | null;
    }>),
    previousStart,
    previousEnd,
  );
  const { aggregateSeries: previousAggregateSeries, dateKeys: previousDateKeys } = buildSeriesForRange({
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
    expenseAllocations: previousExpenseAllocations,
    netRevenueByShop: previousNetRevenueByShop,
    feeConfigByShop,
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

type OrderInput = {
  id: string;
  shopId?: string | null;
  createdAt?: Date | null;
  shippingRevenue?: number | null;
  shippingCost?: number | null;
  shippingCountryCode?: string | null;
  refundedProductAmount?: number | null;
  refundedShippingAmount?: number | null;
  paymentFeeActual?: number | null;
};

type OrderRevenueInput = {
  orderId: string;
  lineRevenue: number;
};

function buildOrderRevenueMap(orderLines: OrderRevenueInput[]) {
  const orderRevenueMap = new Map<string, number>();
  for (const line of orderLines) {
    orderRevenueMap.set(line.orderId, (orderRevenueMap.get(line.orderId) ?? 0) + line.lineRevenue);
  }
  return orderRevenueMap;
}

function buildNetRevenueByShop(
  orders: OrderInput[],
  orderRevenueMap: Map<string, number>,
  activeShopId: string | null,
) {
  const netRevenueByShop = new Map<string, number>();
  for (const order of orders) {
    const shopId = (order as any).shopId ?? activeShopId;
    if (!shopId) continue;
    const productRevenue = orderRevenueMap.get(order.id) ?? 0;
    const refundedProduct = (order as any).refundedProductAmount ?? 0;
    const refundedShipping = (order as any).refundedShippingAmount ?? 0;
    const shippingRevenue = (order as any).shippingRevenue ?? 0;
    const netProductRevenue = Math.max(0, productRevenue - refundedProduct);
    const netShippingRevenue = Math.max(0, shippingRevenue - refundedShipping);
    const netRevenue = netProductRevenue + netShippingRevenue;
    netRevenueByShop.set(shopId, (netRevenueByShop.get(shopId) ?? 0) + netRevenue);
  }
  return netRevenueByShop;
}
