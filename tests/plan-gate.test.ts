import test from "node:test";
import assert from "node:assert/strict";
import { PlanStatus, PlanTier } from "@prisma/client";
import { canUseFeature } from "@/lib/planGate";

test("free plan cannot use shopify payments sync", () => {
  const result = canUseFeature({
    planTier: PlanTier.FREE,
    planStatus: PlanStatus.ACTIVE,
    feature: "SHOPIFY_PAYMENTS_SYNC",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_upgrade_required");
    assert.equal(result.requiredTier, PlanTier.STANDARD);
  }
});

test("standard plan can use shopify payments sync", () => {
  const result = canUseFeature({
    planTier: PlanTier.STANDARD,
    planStatus: PlanStatus.ACTIVE,
    feature: "SHOPIFY_PAYMENTS_SYNC",
  });

  assert.equal(result.ok, true);
});

test("standard plan cannot use meta sync", () => {
  const result = canUseFeature({
    planTier: PlanTier.STANDARD,
    planStatus: PlanStatus.ACTIVE,
    feature: "META_SYNC",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_upgrade_required");
    assert.equal(result.requiredTier, PlanTier.PREMIUM);
  }
});

test("premium plan can use meta features while trialing", () => {
  const result = canUseFeature({
    planTier: PlanTier.PREMIUM,
    planStatus: PlanStatus.TRIALING,
    feature: "META_CONNECTIONS",
  });

  assert.equal(result.ok, true);
});

test("inactive plan is blocked even with premium tier", () => {
  const result = canUseFeature({
    planTier: PlanTier.PREMIUM,
    planStatus: PlanStatus.CANCELED,
    feature: "META_SYNC",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_inactive");
  }
});
