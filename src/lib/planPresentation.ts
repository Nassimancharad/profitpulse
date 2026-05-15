import { PlanStatus, PlanTier } from "@prisma/client";

export const PLAN_TIER_OPTIONS = [PlanTier.FREE, PlanTier.STANDARD, PlanTier.PREMIUM] as const;

export const PLAN_STATUS_OPTIONS = [
  PlanStatus.ACTIVE,
  PlanStatus.TRIALING,
  PlanStatus.PAST_DUE,
  PlanStatus.CANCELED,
] as const;

export function formatPlanLabel(planTier: PlanTier) {
  return planTier.charAt(0) + planTier.slice(1).toLowerCase();
}

export function formatPlanStatus(planStatus: PlanStatus) {
  return planStatus
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
