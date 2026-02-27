import prisma from "@/lib/prisma";
import { getAllocatedAdSpendByShop, getAllocatedAdSpendByShopByDate } from "@/lib/portfolioAdSpend";
import type { ShopOverview } from "@/domain/profit-engine";

type DashboardDbLike = {
  shop: {
    findMany: (args: unknown) => Promise<ShopOverview[]>;
  };
};

export async function fetchDashboardShops(
  authorizedShops: string[],
  deps: { db?: DashboardDbLike } = {},
): Promise<ShopOverview[]> {
  const db = deps.db ?? (prisma as unknown as DashboardDbLike);
  try {
    return await db.shop.findMany({
      where: { shopDomain: { in: authorizedShops } },
      select: {
        id: true,
        shopDomain: true,
        paymentFeePct: true,
        paymentFeeFixed: true,
        currency: true,
        timezone: true,
      },
      orderBy: { installedAt: "desc" },
    });
  } catch {
    return db.shop.findMany({
      where: { shopDomain: { in: authorizedShops } },
      select: { id: true, shopDomain: true },
      orderBy: { installedAt: "desc" },
    });
  }
}

type FetchDashboardRawDataInput = {
  activeShop: ShopOverview | null;
  shopIds: string[];
  startDate: Date;
  endDate: Date;
  adSpendStartDateUtc: Date;
  adSpendEndDateUtc: Date;
  previousStart: Date;
  previousEnd: Date;
  previousAdSpendStartDateUtc: Date;
  previousAdSpendEndDateUtc: Date;
  timezone: string;
  useAllocatedAdSpend: boolean;
};

export async function fetchDashboardRawData(input: FetchDashboardRawDataInput) {
  const {
    activeShop,
    shopIds,
    startDate,
    endDate,
    adSpendStartDateUtc,
    adSpendEndDateUtc,
    previousStart,
    previousEnd,
    previousAdSpendStartDateUtc,
    previousAdSpendEndDateUtc,
    timezone,
    useAllocatedAdSpend,
  } = input;

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
    variantCostCount,
    hasAnyOrderData,
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
    useAllocatedAdSpend
      ? getAllocatedAdSpendByShopByDate(shopIds, startDate, endDate, timezone)
      : Promise.resolve([]),
    (prisma as any).expense?.findMany
      ? (prisma as any).expense.findMany({
          where: {
            OR: [{ shopId: { in: shopIds } }, { shopId: null }],
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
      ? prisma.variant.count({
          where: {
            shopId: activeShop.id,
            costPerUnit: { not: null },
          },
        })
      : Promise.resolve(0),
    activeShop
      ? prisma.order
          .findFirst({
            where: { shopId: activeShop.id },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
    activeShop
      ? prisma.syncState.findMany({
          where: { shopId: activeShop.id },
        })
      : Promise.resolve([]),
  ]);

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
        : Promise.resolve([]),
      useAllocatedAdSpend
        ? getAllocatedAdSpendByShopByDate(shopIds, previousStart, previousEnd, timezone)
        : Promise.resolve([]),
    ]);

  return {
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
    variantCostCount,
    hasAnyOrderData,
    syncStates,
    previousOrderLines,
    previousOrders,
    previousAdSpends,
    previousPortfolioAdAllocationsByDate,
  };
}
