import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupabaseTenantOrUserError, mapShopifyPersistErrorMessage } from "../src/app/api/auth/shopify/callback/route";

test("isSupabaseTenantOrUserError detects tenant/user db auth failures", () => {
  assert.equal(isSupabaseTenantOrUserError(new Error("Tenant or user not found")), true);
  assert.equal(isSupabaseTenantOrUserError(new Error("random prisma error")), false);
});

test("mapShopifyPersistErrorMessage returns actionable db config message for Supabase auth errors", () => {
  const supabaseMessage = mapShopifyPersistErrorMessage(new Error("Tenant or user not found"));
  const genericMessage = mapShopifyPersistErrorMessage(new Error("Unknown write error"));

  assert.equal(
    supabaseMessage,
    "Database connection is misconfigured. Verify Supabase DATABASE_URL credentials.",
  );
  assert.equal(genericMessage, "Failed to persist Shopify connection");
});
