import { resolveShippingCost, type ShippingCostRuleInput } from './shipping-cost';
import { normalizeShopTimezone, toTimeZoneDateKey } from '@/lib/timezone';
import {
  calculateNetProfitForOrder,
  calculateNetRevenueForOrder,
  calculatePaymentFeesForOrder,
} from './profit';

export type OrderProfitBreakdown = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: Date;
  productRevenue: number;
  shippingRevenue: number;
  refundedProductAmount: number;
  refundedShippingAmount: number;
  netProductRevenue: number;
  netShippingRevenue: number;
  refundsProduct: number;
  refundsShipping: number;
  paymentFeeEstimated: number;
  paymentFeeActual: number | null;
  cogs: number;
  shippingCost: number;
  adCostAllocated: number;
  paymentFee: number;
  netProfit: number;
};

export type OrderProfitResult = {
  orders: OrderProfitBreakdown[];
  warnings: string[];
};

export type OrderProfitInputOrder = {
  id: string;
  shopifyOrderId: string;
  createdAt: Date;
  shippingRevenue: number;
  shippingCost: number | null;
  shippingCountryCode: string | null;
  refundedProductAmount: number;
  refundedShippingAmount: number;
  paymentFeeActual: number | null;
  paymentFeePct: number;
  paymentFeeFixed: number;
};

export type OrderProfitInputLine = {
  orderId: string;
  quantity: number;
  lineRevenue: number;
  costPerUnit: number | null;
};

export type OrderProfitInputAdSpend = {
  date: Date;
  amountSpent: number;
};

type OrderProfitWorking = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: Date;
  productRevenue: number;
  shippingRevenue: number;
  refundedProductAmount: number;
  refundedShippingAmount: number;
  cogs: number;
  shippingCost: number | null;
  shippingCountryCode: string | null;
  adCostAllocated: number;
  paymentFeeActual: number | null;
  paymentFeePct: number;
  paymentFeeFixed: number;
};

function toDateKey(value: Date, timezone: string) {
  return toTimeZoneDateKey(value, timezone);
}

export function calculateOrderProfitBreakdown(
  orders: OrderProfitInputOrder[],
  orderLines: OrderProfitInputLine[],
  adSpends: OrderProfitInputAdSpend[],
  shippingCostRules: ShippingCostRuleInput[],
  timezone?: string | null,
): OrderProfitResult {
  const warnings: string[] = [];
  const resolvedTimezone = normalizeShopTimezone(timezone);
  const orderMap = new Map<string, OrderProfitWorking>();

  for (const order of orders) {
    orderMap.set(order.id, {
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      createdAt: new Date(order.createdAt),
      productRevenue: 0,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
      cogs: 0,
      shippingCost: order.shippingCost ?? null,
      shippingCountryCode: order.shippingCountryCode ?? null,
      adCostAllocated: 0,
      paymentFeeActual: order.paymentFeeActual ?? null,
      paymentFeePct: order.paymentFeePct ?? 0,
      paymentFeeFixed: order.paymentFeeFixed ?? 0,
    });
  }

  for (const line of orderLines) {
    const entry = orderMap.get(line.orderId);
    if (!entry) continue;
    entry.productRevenue += line.lineRevenue;
    if (line.costPerUnit != null) {
      entry.cogs += line.costPerUnit * line.quantity;
    }
  }

  for (const entry of orderMap.values()) {
    if (entry.shippingCost != null) {
      continue;
    }
    const orderValue = entry.productRevenue + entry.shippingRevenue;
    const resolved = resolveShippingCost(
      shippingCostRules,
      orderValue,
      entry.shippingCountryCode,
    );
    if (!resolved) {
      warnings.push(`No shipping cost rule matched for order ${entry.orderId}.`);
      continue;
    }
    entry.shippingCost = resolved.cost;
  }

  const spendByDate = new Map<string, number>();
  for (const spend of adSpends) {
    const key = toDateKey(spend.date, resolvedTimezone);
    spendByDate.set(key, (spendByDate.get(key) ?? 0) + spend.amountSpent);
  }

  const ordersByDate = new Map<string, OrderProfitWorking[]>();
  for (const entry of orderMap.values()) {
    const key = toDateKey(entry.createdAt, resolvedTimezone);
    const bucket = ordersByDate.get(key) ?? [];
    bucket.push(entry);
    ordersByDate.set(key, bucket);
  }

  for (const [dateKey, bucket] of ordersByDate.entries()) {
    const dailySpend = spendByDate.get(dateKey) ?? 0;
    if (dailySpend <= 0) continue;
    const totalNetRevenue = bucket.reduce(
      (sum, order) =>
        sum +
        Math.max(0, order.productRevenue - order.refundedProductAmount) +
        Math.max(0, order.shippingRevenue - order.refundedShippingAmount),
      0,
    );
    if (totalNetRevenue <= 0) continue;
    for (const order of bucket) {
      const netProductRevenue = Math.max(0, order.productRevenue - order.refundedProductAmount);
      const netShippingRevenue = Math.max(
        0,
        order.shippingRevenue - order.refundedShippingAmount,
      );
      const share = (netProductRevenue + netShippingRevenue) / totalNetRevenue;
      order.adCostAllocated = dailySpend * share;
    }
  }

  const breakdown: OrderProfitBreakdown[] = Array.from(orderMap.values())
    .map((order) => {
      const netRevenue = calculateNetRevenueForOrder({
        productRevenue: order.productRevenue,
        shippingRevenue: order.shippingRevenue,
        refundedProductAmount: order.refundedProductAmount,
        refundedShippingAmount: order.refundedShippingAmount,
      });
      const computedFee = calculatePaymentFeesForOrder({
        netRevenue,
        paymentFeeActual: null,
        paymentFeePct: order.paymentFeePct,
        paymentFeeFixed: order.paymentFeeFixed,
      });
      const paymentFee = calculatePaymentFeesForOrder({
        netRevenue,
        paymentFeeActual: order.paymentFeeActual,
        paymentFeePct: order.paymentFeePct,
        paymentFeeFixed: order.paymentFeeFixed,
      });
      const netProductRevenue = Math.max(0, order.productRevenue - order.refundedProductAmount);
      const netShippingRevenue = Math.max(
        0,
        order.shippingRevenue - order.refundedShippingAmount,
      );

      return {
        orderId: order.orderId,
        shopifyOrderId: order.shopifyOrderId,
        createdAt: order.createdAt,
        productRevenue: netProductRevenue,
        shippingRevenue: netShippingRevenue,
        refundedProductAmount: order.refundedProductAmount,
        refundedShippingAmount: order.refundedShippingAmount,
        netProductRevenue,
        netShippingRevenue,
        refundsProduct: order.refundedProductAmount,
        refundsShipping: order.refundedShippingAmount,
        paymentFeeEstimated: computedFee,
        paymentFeeActual: order.paymentFeeActual ?? null,
        cogs: order.cogs,
        shippingCost: order.shippingCost ?? 0,
        adCostAllocated: order.adCostAllocated,
        paymentFee,
        netProfit: calculateNetProfitForOrder({
          netRevenue,
          cogs: order.cogs,
          shippingCost: order.shippingCost ?? 0,
          adCostAllocated: order.adCostAllocated,
          paymentFee,
        }),
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { orders: breakdown, warnings };
}
