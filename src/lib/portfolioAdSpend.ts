import prisma from "@/lib/prisma";
import { calculateNetRevenueForOrder } from "@/lib/profit";

export type AdAccountLink = {
  shopId: string;
  adAccountId: string;
};

export type AdSpendRow = {
  shopId: string;
  adAccountId: string;
  date: Date;
  amountSpent: number;
};

export type ShopRevenueRow = {
  shopId: string;
  date: Date;
  netRevenue: number;
};

type ShopAllocation = {
  shopId: string;
  totalAdSpend: number;
};

export type ShopDailyAdSpend = {
  shopId: string;
  date: Date;
  amountSpent: number;
};

function toDateKey(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day.toISOString().slice(0, 10);
}

export function allocateAdSpendByShop(
  adAccounts: AdAccountLink[],
  adSpends: AdSpendRow[],
  revenues: ShopRevenueRow[],
): ShopAllocation[] {
  const accountShops = new Map<string, string[]>();
  for (const link of adAccounts) {
    const list = accountShops.get(link.adAccountId) ?? [];
    if (!list.includes(link.shopId)) {
      list.push(link.shopId);
      accountShops.set(link.adAccountId, list);
    }
  }

  const shopRevenueByDate = new Map<string, Map<string, number>>();
  for (const row of revenues) {
    const dateKey = toDateKey(row.date);
    const shopMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    shopMap.set(row.shopId, (shopMap.get(row.shopId) ?? 0) + row.netRevenue);
    shopRevenueByDate.set(dateKey, shopMap);
  }

  const spendByShopAccountDate = new Map<string, number>();
  for (const spend of adSpends) {
    const dateKey = toDateKey(spend.date);
    const key = `${spend.shopId}::${spend.adAccountId}::${dateKey}`;
    spendByShopAccountDate.set(key, (spendByShopAccountDate.get(key) ?? 0) + spend.amountSpent);
  }

  const spendByAccountDate = new Map<string, number>();
  for (const [key, amount] of spendByShopAccountDate.entries()) {
    const [, adAccountId, dateKey] = key.split("::");
    const accountKey = `${adAccountId}::${dateKey}`;
    const existing = spendByAccountDate.get(accountKey) ?? 0;
    spendByAccountDate.set(accountKey, Math.max(existing, amount));
  }

  const allocationByShop = new Map<string, number>();
  for (const [accountDateKey, amount] of spendByAccountDate.entries()) {
    const [adAccountId, dateKey] = accountDateKey.split("::");
    const shops = accountShops.get(adAccountId) ?? [];
    if (shops.length === 0 || amount <= 0) {
      continue;
    }
    const revenueMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    const totalRevenue = shops.reduce((sum, shopId) => sum + (revenueMap.get(shopId) ?? 0), 0);
    if (totalRevenue <= 0) {
      continue;
    }
    for (const shopId of shops) {
      const share = (revenueMap.get(shopId) ?? 0) / totalRevenue;
      allocationByShop.set(shopId, (allocationByShop.get(shopId) ?? 0) + amount * share);
    }
  }

  return Array.from(allocationByShop.entries()).map(([shopId, totalAdSpend]) => ({
    shopId,
    totalAdSpend,
  }));
}

export function allocateAdSpendByShopByDate(
  adAccounts: AdAccountLink[],
  adSpends: AdSpendRow[],
  revenues: ShopRevenueRow[],
): ShopDailyAdSpend[] {
  const accountShops = new Map<string, string[]>();
  for (const link of adAccounts) {
    const list = accountShops.get(link.adAccountId) ?? [];
    if (!list.includes(link.shopId)) {
      list.push(link.shopId);
      accountShops.set(link.adAccountId, list);
    }
  }

  const shopRevenueByDate = new Map<string, Map<string, number>>();
  for (const row of revenues) {
    const dateKey = toDateKey(row.date);
    const shopMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    shopMap.set(row.shopId, (shopMap.get(row.shopId) ?? 0) + row.netRevenue);
    shopRevenueByDate.set(dateKey, shopMap);
  }

  const spendByShopAccountDate = new Map<string, number>();
  for (const spend of adSpends) {
    const dateKey = toDateKey(spend.date);
    const key = `${spend.shopId}::${spend.adAccountId}::${dateKey}`;
    spendByShopAccountDate.set(key, (spendByShopAccountDate.get(key) ?? 0) + spend.amountSpent);
  }

  const spendByAccountDate = new Map<string, number>();
  for (const [key, amount] of spendByShopAccountDate.entries()) {
    const [, adAccountId, dateKey] = key.split("::");
    const accountKey = `${adAccountId}::${dateKey}`;
    const existing = spendByAccountDate.get(accountKey) ?? 0;
    spendByAccountDate.set(accountKey, Math.max(existing, amount));
  }

  const allocationByShopDate = new Map<string, number>();
  for (const [accountDateKey, amount] of spendByAccountDate.entries()) {
    const [adAccountId, dateKey] = accountDateKey.split("::");
    const shops = accountShops.get(adAccountId) ?? [];
    if (shops.length === 0 || amount <= 0) {
      continue;
    }
    const revenueMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    const totalRevenue = shops.reduce((sum, shopId) => sum + (revenueMap.get(shopId) ?? 0), 0);
    if (totalRevenue <= 0) {
      continue;
    }
    for (const shopId of shops) {
      const share = (revenueMap.get(shopId) ?? 0) / totalRevenue;
      const key = `${shopId}::${dateKey}`;
      allocationByShopDate.set(key, (allocationByShopDate.get(key) ?? 0) + amount * share);
    }
  }

  return Array.from(allocationByShopDate.entries()).map(([key, amountSpent]) => {
    const [shopId, dateKey] = key.split("::");
    return {
      shopId,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      amountSpent,
    };
  });
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

export async function getAllocatedAdSpendByShop(
  shopIds: string[],
  start: Date,
  end: Date,
): Promise<ShopAllocation[]> {
  const startDate = atStartOfDay(start);
  const endDate = atEndOfDay(end);

  const [adAccounts, adSpends, orders, orderLines] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: { shopId: { in: shopIds } },
      select: { shopId: true, adAccountId: true },
    }),
    prisma.adSpend.findMany({
      where: { shopId: { in: shopIds }, date: { gte: startDate, lte: endDate } },
      select: { shopId: true, adAccountId: true, date: true, amountSpent: true },
    }),
    (async () => {
      try {
        return await prisma.order.findMany({
          where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
          select: {
            id: true,
            shopId: true,
            createdAt: true,
            shippingRevenue: true,
            refundedShippingAmount: true,
            refundedProductAmount: true,
          },
        });
      } catch {
        return prisma.order.findMany({
          where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
          select: { id: true, shopId: true, createdAt: true },
        });
      }
    })(),
    prisma.orderLine.findMany({
      where: { order: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } } },
      select: { orderId: true, lineRevenue: true },
    }),
  ]);

  const revenueByOrder = new Map<string, number>();
  for (const line of orderLines) {
    revenueByOrder.set(line.orderId, (revenueByOrder.get(line.orderId) ?? 0) + line.lineRevenue);
  }

  const revenueRows: ShopRevenueRow[] = orders.map((order) => {
    const productRevenue = revenueByOrder.get(order.id) ?? 0;
    return {
      shopId: order.shopId,
      date: order.createdAt,
      netRevenue: calculateNetRevenueForOrder({
        productRevenue,
        shippingRevenue: (order as any).shippingRevenue ?? 0,
        refundedProductAmount: (order as any).refundedProductAmount ?? 0,
        refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
      }),
    };
  });

  return allocateAdSpendByShop(adAccounts, adSpends, revenueRows);
}

export async function getAllocatedAdSpendByShopByDate(
  shopIds: string[],
  start: Date,
  end: Date,
): Promise<ShopDailyAdSpend[]> {
  const startDate = atStartOfDay(start);
  const endDate = atEndOfDay(end);

  const [adAccounts, adSpends, orders, orderLines] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: { shopId: { in: shopIds } },
      select: { shopId: true, adAccountId: true },
    }),
    prisma.adSpend.findMany({
      where: { shopId: { in: shopIds }, date: { gte: startDate, lte: endDate } },
      select: { shopId: true, adAccountId: true, date: true, amountSpent: true },
    }),
    (async () => {
      try {
        return await prisma.order.findMany({
          where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
          select: {
            id: true,
            shopId: true,
            createdAt: true,
            shippingRevenue: true,
            refundedShippingAmount: true,
            refundedProductAmount: true,
          },
        });
      } catch {
        return prisma.order.findMany({
          where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
          select: { id: true, shopId: true, createdAt: true },
        });
      }
    })(),
    prisma.orderLine.findMany({
      where: { order: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } } },
      select: { orderId: true, lineRevenue: true },
    }),
  ]);

  const revenueByOrder = new Map<string, number>();
  for (const line of orderLines) {
    revenueByOrder.set(line.orderId, (revenueByOrder.get(line.orderId) ?? 0) + line.lineRevenue);
  }

  const revenueRows: ShopRevenueRow[] = orders.map((order) => {
    const productRevenue = revenueByOrder.get(order.id) ?? 0;
    return {
      shopId: order.shopId,
      date: order.createdAt,
      netRevenue: calculateNetRevenueForOrder({
        productRevenue,
        shippingRevenue: (order as any).shippingRevenue ?? 0,
        refundedProductAmount: (order as any).refundedProductAmount ?? 0,
        refundedShippingAmount: (order as any).refundedShippingAmount ?? 0,
      }),
    };
  });

  return allocateAdSpendByShopByDate(adAccounts, adSpends, revenueRows);
}
