import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrderProfitQuery } from "../src/domain/order-profit-api";

test("parseOrderProfitQuery uses shop timezone day bounds for explicit date keys", () => {
  const parsed = parseOrderProfitQuery({
    shop: "demo.myshopify.com",
    start: "2025-01-10",
    end: "2025-01-10",
    timezone: "America/New_York",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.query.startDate.toISOString(), "2025-01-10T05:00:00.000Z");
  assert.equal(parsed.query.endDate.toISOString(), "2025-01-11T04:59:59.999Z");
});

test("parseOrderProfitQuery defaults to store-local today when dates are missing", () => {
  const parsed = parseOrderProfitQuery({
    shop: "demo.myshopify.com",
    start: null,
    end: null,
    timezone: "America/New_York",
    now: new Date("2025-01-11T02:00:00.000Z"),
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.query.startDateKey, "2024-12-12");
  assert.equal(parsed.query.endDateKey, "2025-01-10");
});
