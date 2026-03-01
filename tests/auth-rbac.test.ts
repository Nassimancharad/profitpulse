import { test } from "node:test";
import assert from "node:assert/strict";
import { ShopRole } from "@prisma/client";
import {
  getShopRoleForDomain,
  hasRequiredRole,
  requireAuthorizedShop,
  requireAuthorizedShopRole,
} from "../src/lib/auth";

test("getShopRoleForDomain defaults missing role claims to VIEWER", () => {
  const auth = {
    authorizedShops: new Set(["demo.myshopify.com"]),
    shopRoles: new Map<string, ShopRole>(),
  };

  const role = getShopRoleForDomain(auth, "demo.myshopify.com");
  assert.equal(role, ShopRole.VIEWER);
});

test("hasRequiredRole only allows ADMIN for admin-required actions", () => {
  assert.equal(hasRequiredRole(ShopRole.VIEWER, ShopRole.ADMIN), false);
  assert.equal(hasRequiredRole(ShopRole.ADMIN, ShopRole.ADMIN), true);
  assert.equal(hasRequiredRole(ShopRole.VIEWER, ShopRole.VIEWER), true);
});

test("requireAuthorizedShop returns null when viewer has read access", () => {
  const auth = {
    ok: true as const,
    authorizedShops: new Set(["demo.myshopify.com"]),
    shopRoles: new Map([["demo.myshopify.com", ShopRole.VIEWER]]),
    actorExternalId: "u1",
    source: "cookie" as const,
  };
  assert.equal(requireAuthorizedShop(auth, "demo.myshopify.com"), null);
});

test("requireAuthorizedShopRole blocks viewer from admin operations", async () => {
  const auth = {
    ok: true as const,
    authorizedShops: new Set(["demo.myshopify.com"]),
    shopRoles: new Map([["demo.myshopify.com", ShopRole.VIEWER]]),
    actorExternalId: "u1",
    source: "cookie" as const,
  };
  const response = requireAuthorizedShopRole(auth, "demo.myshopify.com", ShopRole.ADMIN);
  assert.notEqual(response, null);
  assert.equal(response?.status, 403);
  const body = await response?.json();
  assert.equal(body?.error, "Forbidden");
});
