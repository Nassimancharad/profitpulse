import prisma from '@/lib/prisma';
import { resolveShippingCost, type ShippingCostRuleInput } from '@/lib/shippingCost';
import {
  calculateNetProfitForOrder,
  calculateNetRevenueForOrder,
  calculatePaymentFeesForOrder,
} from '@/lib/profit';

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

function toDateKey(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day.toISOString().slice(0, 10);
}

export function calculateOrderProfitBreakdown(
  orders: OrderProfitInputOrder[],
  orderLines: OrderProfitInputLine[],
  adSpends: OrderProfitInputAdSpend[],
  shippingCostRules: ShippingCostRuleInput[],
): OrderProfitResult {
  const warnings: string[] = [];
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
    const key = toDateKey(spend.date);
    spendByDate.set(key, (spendByDate.get(key) ?? 0) + spend.amountSpent);
  }

  const ordersByDate = new Map<string, OrderProfitWorking[]>();
  for (const entry of orderMap.values()) {
    const key = toDateKey(entry.createdAt);
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
      const netShippingRevenue = Math.max(0, order.shippingRevenue - order.refundedShippingAmount);

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

export async function getOrderProfitBreakdown(
  shopId: string,
  start: Date,
  end: Date,
): Promise<OrderProfitResult> {
  const startDate = atStartOfDay(start);
  const endDate = atEndOfDay(end);

  const orders = await (async () => {
    try {
      return await prisma.order.findMany({
        where: { shopId, createdAt: { gte: startDate, lte: endDate } },
        select: {
          id: true,
          shopifyOrderId: true,
          createdAt: true,
          shippingRevenue: true,
          shippingCost: true,
          shippingCountryCode: true,
          refundedProductAmount: true,
          refundedShippingAmount: true,
          paymentFeeActual: true,
          shop: {
            select: {
              paymentFeePct: true,
              paymentFeeFixed: true,
            },
          },
        },
      });
    } catch {
      return prisma.order.findMany({
        where: { shopId, createdAt: { gte: startDate, lte: endDate } },
        select: {
          id: true,
          shopifyOrderId: true,
          createdAt: true,
        },
      });
    }
  })();

  const [orderLines, adSpends, shippingCostRules] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: { shopId, createdAt: { gte: startDate, lte: endDate } },
      },
      select: {
        orderId: true,
        quantity: true,
        lineRevenue: true,
        product: { select: { costPerUnit: true } },
      },
    }),
    prisma.adSpend.findMany({
      where: { shopId, date: { gte: startDate, lte: endDate } },
      select: { date: true, amountSpent: true },
    }),
    (prisma as any).shippingCostRule?.findMany
      ? (prisma as any).shippingCostRule.findMany({
          where: { shopId },
          select: {
            id: true,
            countryCode: true,
            minOrderValue: true,
            maxOrderValue: true,
            costAmount: true,
          },
        })
      : [],
  ]);

  const lineInputs: OrderProfitInputLine[] = orderLines.map((line) => ({
    orderId: line.orderId,
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    costPerUnit: line.product?.costPerUnit ?? null,
  }));

  return calculateOrderProfitBreakdown(
    orders.map((order) => ({
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      createdAt: order.createdAt,
      shippingRevenue: (order as any).shippingRevenue ?? 0,
      shippingCost: (order as any).shippingCost ?? null,
      shippingCountryCode: ((order as any).shippingCountryCode ?? null) as string | null,
      refundedProductAmount: (order as any).refundedProductAmount ?? 0,
      refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
      paymentFeeActual: (order as any).paymentFeeActual ?? null,
      paymentFeePct: (order as any).shop?.paymentFeePct ?? 0,
      paymentFeeFixed: (order as any).shop?.paymentFeeFixed ?? 0,
    })),
    lineInputs,
    adSpends,
    shippingCostRules,
  );
}
