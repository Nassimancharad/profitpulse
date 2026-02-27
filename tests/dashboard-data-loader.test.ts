import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchDashboardShops } from "../src/data/dashboard";

test("fetchDashboardShops falls back to minimal select when extended select fails", async () => {
  const calls: unknown[] = [];
  const db = {
    shop: {
      async findMany(args: unknown) {
        calls.push(args);
        if (calls.length === 1) {
          throw new Error("Column timezone missing");
        }
        return [{ id: "shop_1", shopDomain: "demo.myshopify.com" }] as any;
      },
    },
  };

  const result = await fetchDashboardShops(["demo.myshopify.com"], { db });

  assert.equal(calls.length, 2);
  assert.deepEqual(result, [{ id: "shop_1", shopDomain: "demo.myshopify.com" }]);
});
