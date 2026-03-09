import { PlanStatus, PlanTier } from "@prisma/client";
import prisma from "@/lib/prisma";

export type ShopPlan = {
  shopId: string;
  shopDomain: string;
  planTier: PlanTier;
  planStatus: PlanStatus;
  planUpdatedAt: Date;
};

export async function getShopPlanByDomain(shopDomain: string): Promise<ShopPlan | null> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: {
      id: true,
      shopDomain: true,
      planTier: true,
      planStatus: true,
      planUpdatedAt: true,
    },
  });

  if (!shop) return null;

  return {
    shopId: shop.id,
    shopDomain: shop.shopDomain,
    planTier: shop.planTier,
    planStatus: shop.planStatus,
    planUpdatedAt: shop.planUpdatedAt,
  };
}

export async function updateShopPlan(params: {
  shopId: string;
  planTier: PlanTier;
  planStatus: PlanStatus;
  updatedAt?: Date;
}) {
  const now = params.updatedAt ?? new Date();
  return prisma.shop.update({
    where: { id: params.shopId },
    data: {
      planTier: params.planTier,
      planStatus: params.planStatus,
      planUpdatedAt: now,
    },
    select: {
      id: true,
      shopDomain: true,
      planTier: true,
      planStatus: true,
      planUpdatedAt: true,
    },
  });
}
