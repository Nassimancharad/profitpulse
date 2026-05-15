import assert from "node:assert/strict";
import { test } from "node:test";
import { NextResponse } from "next/server";
import { PlanStatus, PlanTier } from "@prisma/client";
import { handleShopPlanUpdate } from "../src/app/api/shop-plan/route";

function buildRequest(body: Record<string, string>, acceptJson = true) {
  return new Request("https://app.example.com/api/shop-plan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(acceptJson ? { accept: "application/json" } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("handleShopPlanUpdate returns auth response when unauthenticated", async () => {
  const response = await handleShopPlanUpdate(buildRequest({ shop: "demo.myshopify.com", planTier: "STANDARD" }), {
    authenticate: async () => ({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    transitionPlan: async () => {
      throw new Error("should not be called");
    },
  });

  assert.equal(response.status, 401);
});

test("handleShopPlanUpdate validates plan payload", async () => {
  const response = await handleShopPlanUpdate(buildRequest({ shop: "demo.myshopify.com", planTier: "INVALID" }), {
    authenticate: async () => ({
      ok: true as const,
      kind: "shopify" as const,
      provider: "shopify" as const,
      sessionId: null,
      actorUserId: null,
      actorExternalId: "user_1",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": "ADMIN" as const },
      authorizedShops: new Set(["demo.myshopify.com"]),
      shopRoles: new Map([["demo.myshopify.com", "ADMIN" as const]]),
      source: "cookie" as const,
    }),
    transitionPlan: async () => {
      throw new Error("should not be called");
    },
  });

  assert.equal(response.status, 400);
});

test("handleShopPlanUpdate returns updated plan payload", async () => {
  let called = false;
  const response = await handleShopPlanUpdate(buildRequest({ shop: "demo.myshopify.com", planTier: "PREMIUM" }), {
    authenticate: async () => ({
      ok: true as const,
      kind: "shopify" as const,
      provider: "shopify" as const,
      sessionId: null,
      actorUserId: null,
      actorExternalId: "user_1",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": "ADMIN" as const },
      authorizedShops: new Set(["demo.myshopify.com"]),
      shopRoles: new Map([["demo.myshopify.com", "ADMIN" as const]]),
      source: "cookie" as const,
    }),
    transitionPlan: async () => {
      called = true;
      return {
        id: "shop_1",
        shopDomain: "demo.myshopify.com",
        planTier: PlanTier.PREMIUM,
        planStatus: PlanStatus.ACTIVE,
        planUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
        direction: "upgrade" as const,
        changed: true,
      };
    },
  });

  assert.equal(called, true);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.direction, "upgrade");
  assert.equal(payload.planTier, PlanTier.PREMIUM);
});
