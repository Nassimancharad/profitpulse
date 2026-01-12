import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateMonthlyExpenses } from '../src/lib/expenses';
import { buildSeriesForRange } from '../src/lib/dashboardSeries';
import { calculateNetRevenueForOrder } from '../src/lib/profit';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const demoData = JSON.parse(
  readFileSync(join(fixtureDir, 'fixtures', 'demo-data.json'), 'utf8'),
) as {
  shop: { id: string; shopDomain: string };
  products: Array<{ id: string; costPerUnit: number | null }>;
  orders: Array<{
    id: string;
    shopId: string;
    createdAt: string;
    shippingRevenue: number;
    shippingCost: number | null;
    shippingCountryCode: string | null;
    refundedProductAmount: number;
    refundedShippingAmount: number;
  }>;
  orderLines: Array<{ orderId: string; productId: string; quantity: number; lineRevenue: number }>;
  shippingCostRules: Array<{
    id: string;
    shopId: string;
    countryCode: string | null;
    minOrderValue: number | null;
    maxOrderValue: number | null;
    costAmount: number;
  }>;
  adSpends: Array<{ shopId: string; date: string; amountSpent: number }>;
  expenses: Array<{
    shopId: string | null;
    amount: number;
    frequency: string;
    startDate: string;
    endDate: string | null;
  }>;
};

function assertClose(actual: number, expected: number, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

function buildOrderRevenueMap() {
  const map = new Map<string, number>();
  for (const line of demoData.orderLines) {
    map.set(line.orderId, (map.get(line.orderId) ?? 0) + line.lineRevenue);
  }
  return map;
}

test('buildSeriesForRange returns stable daily series for fixture data', () => {
  const startDate = new Date('2025-01-10T00:00:00.000Z');
  const endDate = new Date('2025-01-11T23:59:59.999Z');
  const shopIds = [demoData.shop.id];
  const shops = [{ id: demoData.shop.id, shopDomain: demoData.shop.shopDomain }];

  const orders = demoData.orders.map((order) => ({
    id: order.id,
    shopId: order.shopId,
    createdAt: new Date(order.createdAt),
    shippingRevenue: order.shippingRevenue,
    shippingCost: order.shippingCost,
    shippingCountryCode: order.shippingCountryCode,
    refundedProductAmount: order.refundedProductAmount,
    refundedShippingAmount: order.refundedShippingAmount,
    paymentFeeActual: null,
  }));

  const productMap = new Map(demoData.products.map((product) => [product.id, product]));
  const orderLines = demoData.orderLines.map((line) => ({
    orderId: line.orderId,
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    product: {
      costPerUnit: productMap.get(line.productId)?.costPerUnit ?? null,
    },
  }));

  const orderRevenueMap = buildOrderRevenueMap();
  const netRevenueByShop = new Map<string, number>();
  for (const order of orders) {
    const productRevenue = orderRevenueMap.get(order.id) ?? 0;
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
    });
    netRevenueByShop.set(order.shopId, (netRevenueByShop.get(order.shopId) ?? 0) + netRevenue);
  }

  const expenseAllocations = allocateMonthlyExpenses(
    demoData.expenses.map((expense) => ({
      shopId: expense.shopId,
      amount: expense.amount,
      frequency: expense.frequency,
      startDate: new Date(expense.startDate),
      endDate: expense.endDate ? new Date(expense.endDate) : null,
    })),
    startDate,
    endDate,
  );

  const feeConfigByShop = new Map<string, { pct: number; fixed: number }>([
    [demoData.shop.id, { pct: 2.9, fixed: 0.3 }],
  ]);

  const { dateKeys, aggregateSeries, storeSeries } = buildSeriesForRange({
    startDate,
    endDate,
    shopIds,
    shops,
    activeShopId: demoData.shop.id,
    orders,
    orderLines,
    shippingCostRules: demoData.shippingCostRules,
    adSpends: demoData.adSpends.map((spend) => ({
      shopId: spend.shopId,
      date: new Date(spend.date),
      amountSpent: spend.amountSpent,
    })),
    useAllocatedAdSpend: false,
    portfolioAdAllocationsByDate: [],
    expenseAllocations,
    netRevenueByShop,
    feeConfigByShop,
  });

  assert.deepEqual(dateKeys, ['2025-01-10', '2025-01-11']);

  assert.deepEqual(aggregateSeries.revenue, [85, 20]);
  assert.deepEqual(aggregateSeries.orders, [2, 1]);
  assert.deepEqual(aggregateSeries.cogs, [38, 10]);
  assert.deepEqual(aggregateSeries.adSpend, [21, 7.5]);
  assertClose(aggregateSeries.profit[0], 10.096290322580645);
  assertClose(aggregateSeries.profit[1], -9.218709677419355);
  assertClose(aggregateSeries.margin[0], 0.118780, 1e-6);
  assertClose(aggregateSeries.margin[1], -0.46093548387096774);
  assertClose(aggregateSeries.roas[0], 4.0476190476190474);
  assertClose(aggregateSeries.roas[1], 2.6666666666666665);

  assert.equal(storeSeries.length, 1);
  assert.deepEqual(storeSeries[0].valuesByKpi.revenue, aggregateSeries.revenue);
  assertClose(storeSeries[0].valuesByKpi.profit[0], aggregateSeries.profit[0]);
  assertClose(storeSeries[0].valuesByKpi.profit[1], aggregateSeries.profit[1]);
});
