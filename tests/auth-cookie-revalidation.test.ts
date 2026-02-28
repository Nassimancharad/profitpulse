import { test } from "node:test";
import assert from "node:assert/strict";
import { ShopRole } from "@prisma/client";
import { resolveCookieAuthorizationFromMemberships } from "../src/lib/auth";

test("cookie auth uses DB membership roles when available", () => {
  const result = resolveCookieAuthorizationFromMemberships({
    cookieShops: ["demo.myshopify.com"],
    cookieSub: "user-1",
    dbSession: {
      subjectExternalId: "user-1",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": ShopRole.VIEWER },
    },
  });

  assert.deepEqual(result.authorizedShops, ["demo.myshopify.com"]);
  assert.equal(result.rolesByShop["demo.myshopify.com"], ShopRole.VIEWER);
  assert.equal(result.actorExternalId, "user-1");
});

test("cookie shops not present in DB memberships are removed", () => {
  const result = resolveCookieAuthorizationFromMemberships({
    cookieShops: ["demo.myshopify.com", "other.myshopify.com"],
    cookieSub: "user-1",
    dbSession: {
      subjectExternalId: "user-1",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": ShopRole.ADMIN },
    },
  });

  assert.deepEqual(result.authorizedShops, ["demo.myshopify.com"]);
  assert.equal(result.rolesByShop["demo.myshopify.com"], ShopRole.ADMIN);
  assert.equal(result.rolesByShop["other.myshopify.com"], undefined);
});

test("cookie auth fails closed to VIEWER when DB session is unavailable", () => {
  const result = resolveCookieAuthorizationFromMemberships({
    cookieShops: ["demo.myshopify.com"],
    cookieSub: "user-1",
    dbSession: null,
  });

  assert.deepEqual(result.authorizedShops, ["demo.myshopify.com"]);
  assert.equal(result.rolesByShop["demo.myshopify.com"], ShopRole.VIEWER);
  assert.equal(result.actorExternalId, "user-1");
});
