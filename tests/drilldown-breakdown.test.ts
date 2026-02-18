import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLineItemProfitBreakdown } from "../src/domain/profit-engine/drilldown";

test("buildLineItemProfitBreakdown allocates order-level costs by revenue share", () => {
  const result = buildLineItemProfitBreakdown(
    [
      {
        lineId: "l1",
        quantity: 1,
        lineRevenue: 80,
        costPerUnit: 20,
        productTitle: "Product A",
      },
      {
        lineId: "l2",
        quantity: 1,
        lineRevenue: 20,
        costPerUnit: 5,
        productTitle: "Product B",
      },
    ],
    {
      shippingCost: 10,
      adCostAllocated: 20,
      paymentFee: 5,
    },
  );

  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0].allocationShare - 0.8) < 1e-8);
  assert.ok(Math.abs(result[1].allocationShare - 0.2) < 1e-8);
  assert.ok(Math.abs(result[0].allocatedCosts - 28) < 1e-8);
  assert.ok(Math.abs(result[1].allocatedCosts - 7) < 1e-8);
  assert.ok(Math.abs(result[0].netLineProfit - 32) < 1e-8);
  assert.ok(Math.abs(result[1].netLineProfit - 8) < 1e-8);
});

test("buildLineItemProfitBreakdown falls back to quantity share when revenue is zero", () => {
  const result = buildLineItemProfitBreakdown(
    [
      {
        lineId: "l1",
        quantity: 3,
        lineRevenue: 0,
        costPerUnit: null,
        productTitle: "Product A",
      },
      {
        lineId: "l2",
        quantity: 1,
        lineRevenue: 0,
        costPerUnit: null,
        productTitle: "Product B",
      },
    ],
    {
      shippingCost: 8,
      adCostAllocated: 0,
      paymentFee: 0,
    },
  );

  assert.ok(Math.abs(result[0].allocationShare - 0.75) < 1e-8);
  assert.ok(Math.abs(result[1].allocationShare - 0.25) < 1e-8);
  assert.ok(Math.abs(result[0].allocatedCosts - 6) < 1e-8);
  assert.ok(Math.abs(result[1].allocatedCosts - 2) < 1e-8);
});

test("buildLineItemProfitBreakdown reconciles line net profit with order net profit under refunds", () => {
  const result = buildLineItemProfitBreakdown(
    [
      {
        lineId: "l1",
        quantity: 1,
        lineRevenue: 80,
        costPerUnit: 20,
        productTitle: "Product A",
      },
      {
        lineId: "l2",
        quantity: 1,
        lineRevenue: 20,
        costPerUnit: 5,
        productTitle: "Product B",
      },
    ],
    {
      shippingCost: 10,
      adCostAllocated: 20,
      paymentFee: 5,
      netProductRevenue: 90,
      netShippingRevenue: 6,
    },
  );

  const totalLineNetProfit = result.reduce((sum, line) => sum + line.netLineProfit, 0);
  const orderNetProfit = 90 + 6 - 25 - 10 - 20 - 5;

  assert.ok(Math.abs(totalLineNetProfit - orderNetProfit) < 1e-8);
  assert.ok(Math.abs(result[0].allocatedProductRefund - 8) < 1e-8);
  assert.ok(Math.abs(result[1].allocatedProductRefund - 2) < 1e-8);
});
