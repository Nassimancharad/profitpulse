import { formatShopLabel } from '@/lib/shopLabel';
import { resolveShippingCost, type ShippingCostRuleInput } from '@/lib/shippingCost';
import { getTotalExpensesForView } from '@/lib/expenses';
import { addDaysToDateKey, normalizeShopTimezone, toTimeZoneDateKey } from '@/lib/timezone';
import {
  calculateNetProfitForOrder,
  calculateNetRevenueForOrder,
  calculatePaymentFeesForOrder,
} from '@/lib/profit';

export type DailyMetrics = {
  revenue: number;
  orders: number;
  cogs: number;
  adSpend: number;
  shippingCost: number;
  paymentFees: number;
  expenses: number;
  profit: number;
  margin: number;
  roas: number;
};

export type OrderLineInput = {
  orderId: string;
  quantity: number;
  lineRevenue: number;
  product?: { costPerUnit: number | null } | null;
};

export type OrderInput = {
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

type OrderInfo = {
  shopId: string;
  dateKey: string;
  shippingRevenue: number;
  shippingCost: number | null;
  shippingCountryCode: string | null;
  refundedProductAmount: number;
  refundedShippingAmount: number;
  paymentFeeActual: number | null;
};

type OrderAggregate = {
  productRevenue: number;
  units: number;
  cogs: number;
};

type NormalizedSeriesInputs = {
  dateKeys: string[];
  dailyByShop: Map<string, Map<string, DailyMetrics>>;
  rulesByShop: Map<string, ShippingCostRuleInput[]>;
  orderInfoById: Map<string, OrderInfo>;
  orderAggregates: Map<string, OrderAggregate>;
  adSpendByKey: Map<string, number>;
  expensesByShop: Map<string, number>;
  daysCount: number;
};

function createEmptyDaily(): DailyMetrics {
  return {
    revenue: 0,
    orders: 0,
    cogs: 0,
    adSpend: 0,
    shippingCost: 0,
    paymentFees: 0,
    expenses: 0,
    profit: 0,
    margin: 0,
    roas: 0,
  };
}

function toDateKey(value: Date, timezone: string) {
  return toTimeZoneDateKey(value, timezone);
}

function buildDateKeys(start: Date, end: Date, timezone: string) {
  const keys: string[] = [];
  let cursorKey = toDateKey(start, timezone);
  const lastKey = toDateKey(end, timezone);
  while (cursorKey <= lastKey) {
    keys.push(cursorKey);
    cursorKey = addDaysToDateKey(cursorKey, 1);
  }
  return keys;
}

export function normalizeSeriesInputs({
  startDate,
  endDate,
  shopIds,
  shops,
  activeShopId,
  orders,
  orderLines,
  shippingCostRules,
  adSpends,
  useAllocatedAdSpend,
  portfolioAdAllocationsByDate,
  expenseAllocations,
  netRevenueByShop,
  timezone,
}: {
  startDate: Date;
  endDate: Date;
  shopIds: string[];
  shops: Array<{ id: string; shopDomain: string }>;
  activeShopId: string | null;
  orders: OrderInput[];
  orderLines: OrderLineInput[];
  shippingCostRules: ShippingCostRuleInput[];
  adSpends: Array<{ shopId: string; date: Date; amountSpent: number }>;
  useAllocatedAdSpend: boolean;
  portfolioAdAllocationsByDate: Array<{ shopId: string; date: Date; amountSpent: number }>;
  expenseAllocations: Array<{ shopId: string | null; allocatedAmount: number }>;
  netRevenueByShop: Map<string, number>;
  timezone?: string | null;
}): NormalizedSeriesInputs {
  const resolvedTimezone = normalizeShopTimezone(timezone);
  const dateKeys = buildDateKeys(startDate, endDate, resolvedTimezone);
  const dailyByShop = new Map<string, Map<string, DailyMetrics>>();
  for (const shopId of shopIds) {
    const dayMap = new Map<string, DailyMetrics>();
    for (const dateKey of dateKeys) {
      dayMap.set(dateKey, createEmptyDaily());
    }
    dailyByShop.set(shopId, dayMap);
  }

  const rulesByShop = new Map<string, ShippingCostRuleInput[]>();
  for (const rule of shippingCostRules) {
    const shopId = (rule as any).shopId as string | undefined;
    if (!shopId) continue;
    const list = rulesByShop.get(shopId) ?? [];
    list.push(rule);
    rulesByShop.set(shopId, list);
  }

  const orderInfoById = new Map<string, OrderInfo>();
  for (const order of orders) {
    const shopId = (order as any).shopId ?? activeShopId;
    if (!shopId) continue;
    const createdAt = (order as any).createdAt ?? startDate;
    const dateKey = toDateKey(createdAt, resolvedTimezone);
    orderInfoById.set(order.id, {
      shopId,
      dateKey,
      shippingRevenue: (order as any).shippingRevenue ?? 0,
      shippingCost: (order as any).shippingCost ?? null,
      shippingCountryCode: ((order as any).shippingCountryCode ?? null) as string | null,
      refundedProductAmount: (order as any).refundedProductAmount ?? 0,
      refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
      paymentFeeActual: (order as any).paymentFeeActual ?? null,
    });
  }

  const orderAggregates = new Map<string, OrderAggregate>();
  for (const line of orderLines) {
    const info = orderInfoById.get(line.orderId);
    if (!info) continue;
    const agg = orderAggregates.get(line.orderId) ?? { productRevenue: 0, units: 0, cogs: 0 };
    const costPerUnit = line.product?.costPerUnit ?? 0;
    agg.productRevenue += line.lineRevenue;
    agg.units += line.quantity;
    agg.cogs += line.quantity * costPerUnit;
    orderAggregates.set(line.orderId, agg);
  }

  const adSpendByKey = new Map<string, number>();
  if (useAllocatedAdSpend) {
    for (const row of portfolioAdAllocationsByDate) {
      const dateKey = toDateKey(row.date, resolvedTimezone);
      const key = `${row.shopId}::${dateKey}`;
      adSpendByKey.set(key, (adSpendByKey.get(key) ?? 0) + row.amountSpent);
    }
  } else {
    for (const spend of adSpends) {
      const dateKey = toDateKey(spend.date, resolvedTimezone);
      const key = `${spend.shopId}::${dateKey}`;
      adSpendByKey.set(key, (adSpendByKey.get(key) ?? 0) + spend.amountSpent);
    }
  }

  const expensesByShop = new Map<string, number>();
  for (const shopItem of shops) {
    expensesByShop.set(
      shopItem.id,
      getTotalExpensesForView(expenseAllocations, netRevenueByShop, shopItem.id),
    );
  }

  return {
    dateKeys,
    dailyByShop,
    rulesByShop,
    orderInfoById,
    orderAggregates,
    adSpendByKey,
    expensesByShop,
    daysCount: dateKeys.length || 1,
  };
}

export function computeDailyAggregates(
  normalized: NormalizedSeriesInputs,
  orders: OrderInput[],
  feeConfigByShop: Map<string, { pct: number; fixed: number }>,
) {
  for (const order of orders) {
    const info = normalized.orderInfoById.get(order.id);
    if (!info) continue;
    const agg = normalized.orderAggregates.get(order.id) ?? { productRevenue: 0, units: 0, cogs: 0 };
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue: agg.productRevenue,
      shippingRevenue: info.shippingRevenue,
      refundedProductAmount: info.refundedProductAmount,
      refundedShippingAmount: info.refundedShippingAmount,
    });
    const orderValue = agg.productRevenue + info.shippingRevenue;
    let shippingCost = info.shippingCost;
    if (shippingCost == null) {
      const rules = normalized.rulesByShop.get(info.shopId) ?? [];
      const resolved = resolveShippingCost(rules, orderValue, info.shippingCountryCode);
      shippingCost = resolved?.cost ?? 0;
    }
    const feeConfig = feeConfigByShop.get(info.shopId) ?? { pct: 0, fixed: 0 };
    const paymentFee = calculatePaymentFeesForOrder({
      netRevenue,
      paymentFeeActual: info.paymentFeeActual,
      paymentFeePct: feeConfig.pct,
      paymentFeeFixed: feeConfig.fixed,
    });

    const day = normalized.dailyByShop.get(info.shopId)?.get(info.dateKey);
    if (!day) continue;
    day.revenue += netRevenue;
    day.orders += 1;
    day.cogs += agg.cogs;
    day.shippingCost += shippingCost ?? 0;
    day.paymentFees += paymentFee;
  }

  for (const [key, amount] of normalized.adSpendByKey.entries()) {
    const [shopId, dateKey] = key.split("::");
    const day = normalized.dailyByShop.get(shopId)?.get(dateKey);
    if (!day) continue;
    day.adSpend += amount;
  }

  for (const [shopId, totalExpense] of normalized.expensesByShop.entries()) {
    const perDayExpense = totalExpense / normalized.daysCount;
    const dayMap = normalized.dailyByShop.get(shopId);
    if (!dayMap) continue;
    for (const dateKey of normalized.dateKeys) {
      const day = dayMap.get(dateKey);
      if (!day) continue;
      day.expenses += perDayExpense;
    }
  }

  for (const [shopId, dayMap] of normalized.dailyByShop.entries()) {
    for (const dateKey of normalized.dateKeys) {
      const day = dayMap.get(dateKey);
      if (!day) continue;
      day.profit = calculateNetProfitForOrder({
        netRevenue: day.revenue,
        cogs: day.cogs,
        shippingCost: day.shippingCost,
        adCostAllocated: day.adSpend,
        paymentFee: day.paymentFees,
        expenses: day.expenses,
      });
      day.margin = day.revenue > 0 ? day.profit / day.revenue : 0;
      day.roas = day.adSpend > 0 ? day.revenue / day.adSpend : 0;
    }
  }
}

export function buildSeriesForRange({
  startDate,
  endDate,
  shopIds,
  shops,
  activeShopId,
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
}: {
  startDate: Date;
  endDate: Date;
  shopIds: string[];
  shops: Array<{ id: string; shopDomain: string }>;
  activeShopId: string | null;
  orders: OrderInput[];
  orderLines: OrderLineInput[];
  shippingCostRules: ShippingCostRuleInput[];
  adSpends: Array<any>;
  useAllocatedAdSpend: boolean;
  portfolioAdAllocationsByDate: Array<any>;
  expenseAllocations: Array<{ shopId: string | null; allocatedAmount: number }>;
  netRevenueByShop: Map<string, number>;
  feeConfigByShop: Map<string, { pct: number; fixed: number }>;
  timezone?: string | null;
}) {
  const normalized = normalizeSeriesInputs({
    startDate,
    endDate,
    shopIds,
    shops,
    activeShopId,
    orders,
    orderLines,
    shippingCostRules,
    adSpends,
    useAllocatedAdSpend,
    portfolioAdAllocationsByDate,
    expenseAllocations,
    netRevenueByShop,
    timezone,
  });

  computeDailyAggregates(normalized, orders, feeConfigByShop);

  const aggregateSeries = buildAggregateSeries(normalized.dailyByShop, normalized.dateKeys, activeShopId, shopIds);
  const storeSeries = shops.map((shopItem) => ({
    shopId: shopItem.id,
    label: formatShopLabel(shopItem.shopDomain),
    valuesByKpi: buildShopSeries(normalized.dailyByShop.get(shopItem.id), normalized.dateKeys),
  }));

  return { dateKeys: normalized.dateKeys, aggregateSeries, storeSeries };
}

function buildShopSeries(dayMap: Map<string, DailyMetrics> | undefined, dateKeys: string[]) {
  const metrics = dayMap ?? new Map<string, DailyMetrics>();
  const series = {
    revenue: [] as number[],
    orders: [] as number[],
    cogs: [] as number[],
    adSpend: [] as number[],
    profit: [] as number[],
    margin: [] as number[],
    roas: [] as number[],
  };
  for (const dateKey of dateKeys) {
    const day = metrics.get(dateKey) ?? createEmptyDaily();
    series.revenue.push(day.revenue);
    series.orders.push(day.orders);
    series.cogs.push(day.cogs);
    series.adSpend.push(day.adSpend);
    series.profit.push(day.profit);
    series.margin.push(day.margin);
    series.roas.push(day.roas);
  }
  return series;
}

function buildAggregateSeries(
  dailyByShop: Map<string, Map<string, DailyMetrics>>,
  dateKeys: string[],
  activeShopId: string | null,
  shopIds: string[],
) {
  const targetShopIds = activeShopId ? [activeShopId] : shopIds;
  const aggregate = {
    revenue: [] as number[],
    orders: [] as number[],
    cogs: [] as number[],
    adSpend: [] as number[],
    profit: [] as number[],
    margin: [] as number[],
    roas: [] as number[],
  };

  for (const dateKey of dateKeys) {
    let revenue = 0;
    let orders = 0;
    let cogs = 0;
    let adSpend = 0;
    let profit = 0;

    for (const shopId of targetShopIds) {
      const day = dailyByShop.get(shopId)?.get(dateKey);
      if (!day) continue;
      revenue += day.revenue;
      orders += day.orders;
      cogs += day.cogs;
      adSpend += day.adSpend;
      profit += day.profit;
    }

    const margin = revenue > 0 ? profit / revenue : 0;
    const roas = adSpend > 0 ? revenue / adSpend : 0;

    aggregate.revenue.push(revenue);
    aggregate.orders.push(orders);
    aggregate.cogs.push(cogs);
    aggregate.adSpend.push(adSpend);
    aggregate.profit.push(profit);
    aggregate.margin.push(margin);
    aggregate.roas.push(roas);
  }

  return aggregate;
}
