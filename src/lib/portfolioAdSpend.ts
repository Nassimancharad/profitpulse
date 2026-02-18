import prisma from "@/lib/prisma";
import { calculateNetRevenueForOrder } from "@/lib/profit";
import { normalizeShopTimezone, toTimeZoneDateKey } from "@/lib/timezone";

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

function toRevenueDateKey(value: Date, timezone: string) {
  return toTimeZoneDateKey(value, timezone);
}

function toAdSpendDayKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function allocateAdSpendByShop(
  adAccounts: AdAccountLink[],
  adSpends: AdSpendRow[],
  revenues: ShopRevenueRow[],
  timezone?: string | null,
): ShopAllocation[] {
  const resolvedTimezone = normalizeShopTimezone(timezone);
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
    const dateKey = toRevenueDateKey(row.date, resolvedTimezone);
    const shopMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    shopMap.set(row.shopId, (shopMap.get(row.shopId) ?? 0) + row.netRevenue);
    shopRevenueByDate.set(dateKey, shopMap);
  }

  const spendByShopAccountDate = new Map<string, number>();
  for (const spend of adSpends) {
    // Meta `date_start` rows are stored as canonical day keys (00:00:00Z).
    const dateKey = toAdSpendDayKey(spend.date);
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
  timezone?: string | null,
): ShopDailyAdSpend[] {
  const resolvedTimezone = normalizeShopTimezone(timezone);
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
    const dateKey = toRevenueDateKey(row.date, resolvedTimezone);
    const shopMap = shopRevenueByDate.get(dateKey) ?? new Map<string, number>();
    shopMap.set(row.shopId, (shopMap.get(row.shopId) ?? 0) + row.netRevenue);
    shopRevenueByDate.set(dateKey, shopMap);
  }

  const spendByShopAccountDate = new Map<string, number>();
  for (const spend of adSpends) {
    // Meta `date_start` rows are stored as canonical day keys (00:00:00Z).
    const dateKey = toAdSpendDayKey(spend.date);
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

export async function getAllocatedAdSpendByShop(
  shopIds: string[],
  start: Date,
  end: Date,
  timezone?: string | null,
): Promise<ShopAllocation[]> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const resolvedTimezone = normalizeShopTimezone(timezone);
  const startDayKey = toTimeZoneDateKey(startDate, resolvedTimezone);
  const endDayKey = toTimeZoneDateKey(endDate, resolvedTimezone);
  const adSpendStartDate = new Date(`${startDayKey}T00:00:00.000Z`);
  const adSpendEndDate = new Date(`${endDayKey}T23:59:59.999Z`);

  const [adAccounts, adSpends, orders, orderLines] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: { shopId: { in: shopIds } },
      select: { shopId: true, adAccountId: true },
    }),
    prisma.adSpend.findMany({
      where: { shopId: { in: shopIds }, date: { gte: adSpendStartDate, lte: adSpendEndDate } },
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

  return allocateAdSpendByShop(adAccounts, adSpends, revenueRows, timezone);
}

export async function getAllocatedAdSpendByShopByDate(
  shopIds: string[],
  start: Date,
  end: Date,
  timezone?: string | null,
): Promise<ShopDailyAdSpend[]> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const resolvedTimezone = normalizeShopTimezone(timezone);
  const startDayKey = toTimeZoneDateKey(startDate, resolvedTimezone);
  const endDayKey = toTimeZoneDateKey(endDate, resolvedTimezone);
  const adSpendStartDate = new Date(`${startDayKey}T00:00:00.000Z`);
  const adSpendEndDate = new Date(`${endDayKey}T23:59:59.999Z`);

  const [adAccounts, adSpends, orders, orderLines] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: { shopId: { in: shopIds } },
      select: { shopId: true, adAccountId: true },
    }),
    prisma.adSpend.findMany({
      where: { shopId: { in: shopIds }, date: { gte: adSpendStartDate, lte: adSpendEndDate } },
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

  return allocateAdSpendByShopByDate(adAccounts, adSpends, revenueRows, timezone);
}
