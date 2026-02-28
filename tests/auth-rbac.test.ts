import { test } from "node:test";
import assert from "node:assert/strict";
import { ShopRole } from "@prisma/client";
import { getShopRoleForDomain, hasRequiredRole } from "../src/lib/auth";

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
