import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateOrderLineTotals, calculateProfitTotals } from '../src/lib/profit';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const demoData = JSON.parse(
  readFileSync(join(fixtureDir, 'fixtures', 'demo-data.json'), 'utf8'),
) as {
  products: Array<{ id: string; costPerUnit: number | null }>;
  orderLines: Array<{ productId: string; quantity: number; lineRevenue: number }>;
  adSpends: Array<{ amountSpent: number }>;
};

function buildLineInputs() {
  return demoData.orderLines.map((line) => {
    const product = demoData.products.find((p) => p.id === line.productId);
    return {
      quantity: line.quantity,
      lineRevenue: line.lineRevenue,
      costPerUnit: product?.costPerUnit ?? null,
    };
  });
}

test('calculateOrderLineTotals matches existing revenue/unit/cost logic', () => {
  const totals = calculateOrderLineTotals(buildLineInputs());

  assert.equal(totals.totalRevenue, 110);
  assert.equal(totals.totalUnits, 7);
  assert.equal(totals.totalCost, 48);
});

test('calculateProfitTotals includes ad spend and margin', () => {
  const totals = calculateProfitTotals(buildLineInputs(), demoData.adSpends, {
    shippingRevenue: 0,
    shippingCost: 0,
  }, {
    refundedProductAmount: 10,
  }, {
    paymentFees: 5,
  }, {
    expenses: 4,
  });

  assert.equal(totals.totalAdSpend, 28.5);
  assert.equal(totals.profit, 14.5);
  assert.ok(Math.abs(totals.profitMargin - 0.145) < 1e-8);
  assert.ok(Math.abs(totals.roas - 3.5087719298) < 1e-8);
});

test('calculateProfitTotals adds shipping revenue and cost to profit', () => {
  const totals = calculateProfitTotals(buildLineInputs(), demoData.adSpends, {
    shippingRevenue: 5,
    shippingCost: 2,
  }, {
    refundedProductAmount: 10,
  }, {
    paymentFees: 3.945,
  }, {
    expenses: 6,
  });

  assert.equal(totals.totalRevenue, 105);
  assert.equal(totals.shippingMargin, 3);
  assert.ok(Math.abs(totals.profit - 16.555) < 1e-8);
});
