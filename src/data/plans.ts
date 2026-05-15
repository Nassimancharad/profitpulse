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

export type ResolvePlanChangeInput = {
  currentTier: PlanTier;
  currentStatus: PlanStatus;
  targetTier?: PlanTier;
  targetStatus?: PlanStatus;
};

export type ResolvedPlanChange = {
  changed: boolean;
  direction: "upgrade" | "downgrade" | "status_change" | "noop";
  planTier: PlanTier;
  planStatus: PlanStatus;
};

const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  STANDARD: 1,
  PREMIUM: 2,
};

export function resolvePlanChange(input: ResolvePlanChangeInput): ResolvedPlanChange {
  const planTier = input.targetTier ?? input.currentTier;
  let planStatus = input.targetStatus ?? input.currentStatus;

  if (input.targetTier && !input.targetStatus) {
    planStatus = input.currentStatus === PlanStatus.TRIALING ? PlanStatus.TRIALING : PlanStatus.ACTIVE;
  }

  if (planTier === input.currentTier && planStatus === input.currentStatus) {
    return {
      changed: false,
      direction: "noop",
      planTier,
      planStatus,
    };
  }

  if (planTier !== input.currentTier) {
    const currentRank = PLAN_RANK[input.currentTier] ?? -1;
    const targetRank = PLAN_RANK[planTier] ?? -1;

    return {
      changed: true,
      direction: targetRank > currentRank ? "upgrade" : "downgrade",
      planTier,
      planStatus,
    };
  }

  return {
    changed: true,
    direction: "status_change",
    planTier,
    planStatus,
  };
}

export async function transitionShopPlanByDomain(params: {
  shopDomain: string;
  targetTier?: PlanTier;
  targetStatus?: PlanStatus;
  updatedAt?: Date;
}) {
  const now = params.updatedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { shopDomain: params.shopDomain },
      select: {
        id: true,
        shopDomain: true,
        planTier: true,
        planStatus: true,
        planUpdatedAt: true,
      },
    });

    if (!shop) return null;

    const resolved = resolvePlanChange({
      currentTier: shop.planTier,
      currentStatus: shop.planStatus,
      targetTier: params.targetTier,
      targetStatus: params.targetStatus,
    });

    if (!resolved.changed) {
      return {
        ...shop,
        direction: resolved.direction,
        changed: false,
      };
    }

    const updated = await tx.shop.update({
      where: { id: shop.id },
      data: {
        planTier: resolved.planTier,
        planStatus: resolved.planStatus,
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

    return {
      ...updated,
      direction: resolved.direction,
      changed: true,
    };
  });
}
