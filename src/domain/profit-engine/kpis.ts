import { calculatePaymentFee } from './payment-fees';
import {
  calculateNetProfitForOrder,
  calculateNetRevenueForOrder,
  calculateProfitTotals,
  type AdSpendInput,
  type OrderLineTotalsInput,
  type OrderRevenueInput,
} from './profit';
import {
  calculateShippingTotals,
  type ShippingCostRuleInput,
  type ShippingTotals,
} from './shipping-cost';
import {
  allocateMonthlyExpenses,
  getTotalExpensesForView,
  type ExpenseAllocation,
  type ExpenseInput,
} from './expenses';

export type ShopOverview = {
  id: string;
  shopDomain: string;
  paymentFeePct?: number | null;
  paymentFeeFixed?: number | null;
  currency?: string | null;
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

export type OrderLineInput = {
  orderId: string;
  quantity: number;
  lineRevenue: number;
  product?: { costPerUnit: number | null } | null;
};

export type ProductLineInput = {
  quantity: number;
  lineRevenue: number;
  costPerUnit?: number | null;
};

export type LineProfitMetrics = {
  lineCost: number;
  lineProfit: number;
  margin: number;
};

export type ProductProfitSummary = {
  totalRevenue: number;
  totalUnits: number;
  totalCost: number;
  totalAdSpend: number;
  profit: number;
  profitMargin: number;
  roas: number | null;
};

export type StoreKpiData = {
  shops: ShopOverview[];
  orders: OrderInput[];
  orderLines: OrderLineInput[];
  shippingCostRules: ShippingCostRuleInput[];
  adSpends: AdSpendInput[];
  useAllocatedAdSpend: boolean;
  portfolioAdAllocations?: Array<{ shopId: string; totalAdSpend: number }>;
  expenses: ExpenseInput[];
  totalOrders: number;
};

export type DateRange = {
  start: Date;
  end: Date;
};

export type StoreKpiResult = {
  totals: {
    totalRevenue: number;
    totalUnits: number;
    totalCost: number;
    totalAdSpend: number;
    profit: number;
    profitMargin: number;
    roas: number | null;
  };
  refundedProductAmount: number;
  shippingTotals: ShippingTotals;
  totalPaymentFees: number;
  totalExpenses: number;
  averageOrderValue: number;
  netRevenueAfterFees: number;
  netRevenueByShop: Map<string, number>;
  expenseAllocations: ExpenseAllocation[];
  feeConfigByShop: Map<string, { pct: number; fixed: number }>;
};

export function computeNetRevenue(order: OrderRevenueInput): number {
  return calculateNetRevenueForOrder(order);
}

export function computeOrderProfit(
  order: OrderRevenueInput,
  context: Omit<Parameters<typeof calculateNetProfitForOrder>[0], 'netRevenue'>,
): number {
  const netRevenue = calculateNetRevenueForOrder(order);
  return calculateNetProfitForOrder({ netRevenue, ...context });
}

export function computeProductProfit(input: {
  netRevenue: number;
  cogs: number;
  adCostAllocated: number;
  paymentFee?: number | null;
  expenses?: number | null;
}): number {
  return calculateNetProfitForOrder({
    netRevenue: input.netRevenue,
    cogs: input.cogs,
    shippingCost: 0,
    adCostAllocated: input.adCostAllocated,
    paymentFee: input.paymentFee ?? 0,
    expenses: input.expenses ?? 0,
  });
}

export function computeLineProfitMetrics(input: ProductLineInput): LineProfitMetrics {
  const lineCost = input.costPerUnit != null ? input.costPerUnit * input.quantity : 0;
  const lineProfit = input.lineRevenue - lineCost;
  const margin = input.lineRevenue > 0 ? lineProfit / input.lineRevenue : 0;
  return { lineCost, lineProfit, margin };
}

export function computeProductProfitSummary(
  lines: ProductLineInput[],
  adSpends: AdSpendInput[],
): ProductProfitSummary {
  const { totalRevenue, totalUnits, totalCost, totalAdSpend, profit, profitMargin, roas } =
    calculateProfitTotals(lines, adSpends);
  return {
    totalRevenue,
    totalUnits,
    totalCost,
    totalAdSpend,
    profit,
    profitMargin,
    roas,
  };
}

export function computeProductProfitByProductId(
  orderLines: Array<{ productId: string } & ProductLineInput>,
): Map<string, number> {
  const profitByProduct = new Map<string, number>();
  for (const line of orderLines) {
    const { lineProfit } = computeLineProfitMetrics(line);
    profitByProduct.set(
      line.productId,
      (profitByProduct.get(line.productId) ?? 0) + lineProfit,
    );
  }
  return profitByProduct;
}

export function computeStoreKPIs(
  range: DateRange,
  storeId: string,
  data: StoreKpiData,
): StoreKpiResult {
  return computeKpisForScope(range, storeId, data);
}

export function computePortfolioKPIs(
  range: DateRange,
  _userId: string | null,
  data: StoreKpiData,
): StoreKpiResult {
  return computeKpisForScope(range, null, data);
}

function computeKpisForScope(
  range: DateRange,
  activeShopId: string | null,
  data: StoreKpiData,
): StoreKpiResult {
  const orderRevenueMap = buildOrderRevenueMap(data.orderLines);
  const refundedProductAmount = data.orders.reduce(
    (sum, order) => sum + (order.refundedProductAmount ?? 0),
    0,
  );
  const netRevenueByShop = buildNetRevenueByShop(
    data.orders,
    orderRevenueMap,
    activeShopId,
  );
  const expenseAllocations = allocateMonthlyExpenses(
    data.expenses,
    range.start,
    range.end,
  );
  const totalExpenses = getTotalExpensesForView(
    expenseAllocations,
    netRevenueByShop,
    activeShopId,
  );

  const feeConfigByShop = new Map<string, { pct: number; fixed: number }>();
  for (const shopItem of data.shops) {
    feeConfigByShop.set(shopItem.id, {
      pct: shopItem.paymentFeePct ?? 0,
      fixed: shopItem.paymentFeeFixed ?? 0,
    });
  }

  const totalPaymentFees = data.orders.reduce((sum, order) => {
    const orderId = order.id;
    const shopId = order.shopId ?? activeShopId;
    if (!shopId) return sum;
    const actualFee = order.paymentFeeActual ?? null;
    if (actualFee != null) {
      return sum + actualFee;
    }
    const feeConfig = feeConfigByShop.get(shopId) ?? { pct: 0, fixed: 0 };
    const productRevenue = orderRevenueMap.get(orderId) ?? 0;
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
    });
    return sum + calculatePaymentFee(netRevenue, feeConfig.pct, feeConfig.fixed);
  }, 0);

  let shippingTotals: ShippingTotals = {
    shippingRevenue: 0,
    shippingCost: 0,
    shippingMargin: 0,
    warnings: [],
  };

  if (activeShopId) {
    const shippingOrders = data.orders.map((order) => ({
      id: order.id,
      orderValue: (orderRevenueMap.get(order.id) ?? 0) + (order.shippingRevenue ?? 0),
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
      shippingCost: order.shippingCost ?? null,
      shippingCountryCode: order.shippingCountryCode ?? null,
    }));
    shippingTotals = calculateShippingTotals(shippingOrders, data.shippingCostRules);
  } else {
    for (const shopItem of data.shops) {
      const shopOrders = data.orders.filter((order) => order.shopId === shopItem.id);
      const shopRules = data.shippingCostRules.filter(
        (rule) => (rule as any).shopId === shopItem.id,
      );
      const shippingOrders = shopOrders.map((order) => ({
        id: order.id,
        orderValue: (orderRevenueMap.get(order.id) ?? 0) + (order.shippingRevenue ?? 0),
        shippingRevenue: order.shippingRevenue ?? 0,
        refundedShippingAmount: order.refundedShippingAmount ?? 0,
        shippingCost: order.shippingCost ?? null,
        shippingCountryCode: order.shippingCountryCode ?? null,
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

  let allocatedAdSpends: AdSpendInput[] = data.adSpends;
  if (data.useAllocatedAdSpend) {
    const allocationMap = new Map<string, number>();
    for (const allocation of data.portfolioAdAllocations ?? []) {
      allocationMap.set(
        allocation.shopId,
        (allocationMap.get(allocation.shopId) ?? 0) + allocation.totalAdSpend,
      );
    }
    const totalAllocated = activeShopId
      ? allocationMap.get(activeShopId) ?? 0
      : (data.portfolioAdAllocations ?? []).reduce(
          (sum, allocation) => sum + allocation.totalAdSpend,
          0,
        );
    allocatedAdSpends = totalAllocated ? [{ amountSpent: totalAllocated }] : [];
  }

  const lineInputs: OrderLineTotalsInput[] = data.orderLines.map((line) => ({
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    costPerUnit: line.product?.costPerUnit ?? null,
  }));

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

  const averageOrderValue = data.totalOrders > 0 ? totalRevenue / data.totalOrders : 0;
  const netRevenueAfterFees = totalRevenue - totalPaymentFees - shippingTotals.shippingCost;

  return {
    totals: {
      totalRevenue,
      totalUnits,
      totalCost,
      totalAdSpend,
      profit,
      profitMargin,
      roas,
    },
    refundedProductAmount,
    shippingTotals,
    totalPaymentFees,
    totalExpenses,
    averageOrderValue,
    netRevenueAfterFees,
    netRevenueByShop,
    expenseAllocations,
    feeConfigByShop,
  };
}

function buildOrderRevenueMap(orderLines: OrderLineInput[]) {
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
    const shopId = order.shopId ?? activeShopId;
    if (!shopId) continue;
    const productRevenue = orderRevenueMap.get(order.id) ?? 0;
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
    });
    netRevenueByShop.set(shopId, (netRevenueByShop.get(shopId) ?? 0) + netRevenue);
  }
  return netRevenueByShop;
}
