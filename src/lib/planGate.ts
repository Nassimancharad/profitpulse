import { NextResponse } from "next/server";
import { PlanStatus, PlanTier } from "@prisma/client";
import { getShopPlanByDomain } from "@/data/plans";

export type FeatureKey =
  | "SHOPIFY_PAYMENTS_SYNC"
  | "META_CONNECTIONS"
  | "META_SYNC"
  | "META_CAMPAIGNS"
  | "CAMPAIGN_MAPPING";

const FEATURE_MIN_PLAN: Record<FeatureKey, PlanTier> = {
  SHOPIFY_PAYMENTS_SYNC: PlanTier.STANDARD,
  META_CONNECTIONS: PlanTier.PREMIUM,
  META_SYNC: PlanTier.PREMIUM,
  META_CAMPAIGNS: PlanTier.PREMIUM,
  CAMPAIGN_MAPPING: PlanTier.PREMIUM,
};

const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  STANDARD: 1,
  PREMIUM: 2,
};

function isPlanStatusActive(planStatus: PlanStatus) {
  return planStatus === PlanStatus.ACTIVE || planStatus === PlanStatus.TRIALING;
}

export function canUseFeature(input: {
  planTier: PlanTier;
  planStatus: PlanStatus;
  feature: FeatureKey;
}) {
  if (!isPlanStatusActive(input.planStatus)) {
    return {
      ok: false as const,
      reason: "plan_inactive" as const,
      requiredTier: FEATURE_MIN_PLAN[input.feature],
    };
  }

  const requiredTier = FEATURE_MIN_PLAN[input.feature];
  const currentRank = PLAN_RANK[input.planTier] ?? 0;
  const requiredRank = PLAN_RANK[requiredTier] ?? 99;

  if (currentRank < requiredRank) {
    return {
      ok: false as const,
      reason: "plan_upgrade_required" as const,
      requiredTier,
    };
  }

  return { ok: true as const, requiredTier };
}

export async function requireFeatureForShop(params: {
  shopDomain: string;
  feature: FeatureKey;
}) {
  const shop = await getShopPlanByDomain(params.shopDomain);

  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const access = canUseFeature({
    planTier: shop.planTier,
    planStatus: shop.planStatus,
    feature: params.feature,
  });

  if (access.ok) return null;

  return NextResponse.json(
    {
      error:
        access.reason === "plan_inactive"
          ? "Plan inactive. Reactivate your subscription to use this feature."
          : "Upgrade required for this feature.",
      code: access.reason === "plan_inactive" ? "PLAN_INACTIVE" : "PLAN_UPGRADE_REQUIRED",
      feature: params.feature,
      requiredTier: access.requiredTier,
      currentTier: shop.planTier,
      planStatus: shop.planStatus,
    },
    { status: 403 },
  );
}
