import prisma from '@/lib/prisma';
import { normalizeShopTimezone, toTimeZoneDateKey } from '@/lib/timezone';
import {
  calculateOrderProfitBreakdown,
  type OrderProfitInputLine,
  type OrderProfitResult,
} from '@/domain/profit-engine/order-profit';

export async function getOrderProfitBreakdown(
  shopId: string,
  start: Date,
  end: Date,
  timezone?: string | null,
  startDateKey?: string,
  endDateKey?: string,
): Promise<OrderProfitResult> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const resolvedTimezone = normalizeShopTimezone(timezone);
  const startDayKey = startDateKey ?? toTimeZoneDateKey(startDate, resolvedTimezone);
  const endDayKey = endDateKey ?? toTimeZoneDateKey(endDate, resolvedTimezone);
  const adSpendStartDate = new Date(`${startDayKey}T00:00:00.000Z`);
  const adSpendEndDate = new Date(`${endDayKey}T23:59:59.999Z`);

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
      where: { shopId, date: { gte: adSpendStartDate, lte: adSpendEndDate } },
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
    timezone,
  );
}
