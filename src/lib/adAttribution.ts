import prisma from "@/lib/prisma";
import { calculateNetRevenueForOrder } from "@/lib/profit";

export type ProductAdSpend = {
  productId: string;
  totalAdSpend: number;
};

export type ProductRevenueLine = {
  productId: string;
  lineRevenue: number;
};

function atStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function atEndOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * First-version attribution: allocate ad spend to products proportionally by revenue
 * in the given date range. This is a placeholder until we can attribute via UTMs/landing pages.
 */
export async function getAdSpendPerProduct(shopId: string, start: Date, end: Date): Promise<ProductAdSpend[]> {
  const startDate = atStartOfDay(start);
  const endDate = atEndOfDay(end);

  const [orderLines, adSpends] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        order: {
          shopId,
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      select: {
        productId: true,
        lineRevenue: true,
      },
    }),
    prisma.adSpend.findMany({
      where: { shopId, date: { gte: startDate, lte: endDate } },
      select: { amountSpent: true },
    }),
  ]);

  const totalAdSpend = adSpends.reduce((sum, s) => sum + s.amountSpent, 0);
  if (totalAdSpend === 0) {
    return [];
  }

  return allocateAdSpendToProducts(
    orderLines.map((line) => ({
      productId: line.productId,
      lineRevenue: line.lineRevenue,
    })),
    totalAdSpend,
  );
}

export function allocateAdSpendToProducts(
  orderLines: ProductRevenueLine[],
  totalAdSpend: number,
): ProductAdSpend[] {
  if (totalAdSpend <= 0) {
    return [];
  }

  const revenueByProduct = new Map<string, number>();
  for (const line of orderLines) {
    revenueByProduct.set(line.productId, (revenueByProduct.get(line.productId) ?? 0) + line.lineRevenue);
  }

  const totalRevenue = Array.from(revenueByProduct.values()).reduce((sum, val) => {
    return sum + calculateNetRevenueForOrder({
      productRevenue: val,
      shippingRevenue: 0,
      refundedProductAmount: 0,
      refundedShippingAmount: 0,
    });
  }, 0);
  if (totalRevenue === 0) {
    return [];
  }

  const allocations: ProductAdSpend[] = [];
  for (const [productId, revenue] of revenueByProduct.entries()) {
    const share = revenue / totalRevenue;
    allocations.push({
      productId,
      totalAdSpend: totalAdSpend * share,
    });
  }

  return allocations;
}
