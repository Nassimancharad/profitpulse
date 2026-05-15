import assert from "node:assert/strict";
import test from "node:test";
import { PlanStatus, PlanTier } from "@prisma/client";
import { resolvePlanChange } from "../src/data/plans";

test("resolvePlanChange marks higher tier change as upgrade and reactivates inactive plans", () => {
  const result = resolvePlanChange({
    currentTier: PlanTier.FREE,
    currentStatus: PlanStatus.CANCELED,
    targetTier: PlanTier.STANDARD,
  });

  assert.equal(result.changed, true);
  assert.equal(result.direction, "upgrade");
  assert.equal(result.planTier, PlanTier.STANDARD);
  assert.equal(result.planStatus, PlanStatus.ACTIVE);
});

test("resolvePlanChange preserves trialing status during tier changes", () => {
  const result = resolvePlanChange({
    currentTier: PlanTier.STANDARD,
    currentStatus: PlanStatus.TRIALING,
    targetTier: PlanTier.PREMIUM,
  });

  assert.equal(result.changed, true);
  assert.equal(result.direction, "upgrade");
  assert.equal(result.planStatus, PlanStatus.TRIALING);
});

test("resolvePlanChange marks lower tier change as downgrade", () => {
  const result = resolvePlanChange({
    currentTier: PlanTier.PREMIUM,
    currentStatus: PlanStatus.ACTIVE,
    targetTier: PlanTier.FREE,
  });

  assert.equal(result.changed, true);
  assert.equal(result.direction, "downgrade");
  assert.equal(result.planTier, PlanTier.FREE);
  assert.equal(result.planStatus, PlanStatus.ACTIVE);
});

test("resolvePlanChange returns status_change when only status changes", () => {
  const result = resolvePlanChange({
    currentTier: PlanTier.STANDARD,
    currentStatus: PlanStatus.ACTIVE,
    targetStatus: PlanStatus.PAST_DUE,
  });

  assert.equal(result.changed, true);
  assert.equal(result.direction, "status_change");
  assert.equal(result.planTier, PlanTier.STANDARD);
  assert.equal(result.planStatus, PlanStatus.PAST_DUE);
});

test("resolvePlanChange returns noop for identical targets", () => {
  const result = resolvePlanChange({
    currentTier: PlanTier.PREMIUM,
    currentStatus: PlanStatus.ACTIVE,
    targetTier: PlanTier.PREMIUM,
  });

  assert.equal(result.changed, false);
  assert.equal(result.direction, "noop");
});
