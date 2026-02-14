import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStoreKPIs } from '../src/domain/profit-engine';
import { calculateNetRevenueForOrder, calculateProfitTotals } from '../src/lib/profit';
import { calculateShippingTotals } from '../src/lib/shippingCost';
import { calculatePaymentFee } from '../src/lib/paymentFees';
import { allocateMonthlyExpenses, getTotalExpensesForView } from '../src/lib/expenses';

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
  adSpends: Array<{ date: string; amountSpent: number }>;
  shippingCostRules: Array<{
    id: string;
    countryCode: string | null;
    minOrderValue: number | null;
    maxOrderValue: number | null;
    costAmount: number;
  }>;
  expenses: Array<{
    shopId: string | null;
    amount: number;
    frequency: string;
    startDate: string;
    endDate: string | null;
  }>;
};

test('computeStoreKPIs matches legacy dashboard totals', () => {
  const startDate = new Date('2025-01-10T00:00:00.000Z');
  const endDate = new Date('2025-01-11T23:59:59.999Z');
  const paymentFeePct = 2.9;
  const paymentFeeFixed = 0.3;

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

  const orderLines = demoData.orderLines.map((line) => {
    const product = demoData.products.find((item) => item.id === line.productId);
    return {
      orderId: line.orderId,
      quantity: line.quantity,
      lineRevenue: line.lineRevenue,
      product: { costPerUnit: product?.costPerUnit ?? null },
    };
  });

  const orderRevenueMap = new Map<string, number>();
  for (const line of orderLines) {
    orderRevenueMap.set(line.orderId, (orderRevenueMap.get(line.orderId) ?? 0) + line.lineRevenue);
  }

  const refundedProductAmount = orders.reduce(
    (sum, order) => sum + (order.refundedProductAmount ?? 0),
    0,
  );

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

  const totalExpenses = getTotalExpensesForView(
    expenseAllocations,
    netRevenueByShop,
    demoData.shop.id,
  );

  const totalPaymentFees = orders.reduce((sum, order) => {
    const productRevenue = orderRevenueMap.get(order.id) ?? 0;
    const netRevenue = calculateNetRevenueForOrder({
      productRevenue,
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedProductAmount: order.refundedProductAmount ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
    });
    return sum + calculatePaymentFee(netRevenue, paymentFeePct, paymentFeeFixed);
  }, 0);

  const shippingTotals = calculateShippingTotals(
    orders.map((order) => ({
      id: order.id,
      orderValue: (orderRevenueMap.get(order.id) ?? 0) + (order.shippingRevenue ?? 0),
      shippingRevenue: order.shippingRevenue ?? 0,
      refundedShippingAmount: order.refundedShippingAmount ?? 0,
      shippingCost: order.shippingCost ?? null,
      shippingCountryCode: order.shippingCountryCode ?? null,
    })),
    demoData.shippingCostRules,
  );

  const lineInputs = orderLines.map((line) => ({
    quantity: line.quantity,
    lineRevenue: line.lineRevenue,
    costPerUnit: line.product?.costPerUnit ?? null,
  }));

  const totals = calculateProfitTotals(
    lineInputs,
    demoData.adSpends.map((spend) => ({ amountSpent: spend.amountSpent })),
    {
      shippingRevenue: shippingTotals.shippingRevenue,
      shippingCost: shippingTotals.shippingCost,
    },
    {
      refundedProductAmount,
    },
    {
      paymentFees: totalPaymentFees,
    },
    {
      expenses: totalExpenses,
    },
  );

  const expectedAverageOrderValue = totals.totalRevenue / orders.length;
  const expectedNetRevenueAfterFees = totals.totalRevenue - totalPaymentFees - shippingTotals.shippingCost;

  const result = computeStoreKPIs(
    { start: startDate, end: endDate },
    demoData.shop.id,
    {
      shops: [
        {
          id: demoData.shop.id,
          shopDomain: demoData.shop.shopDomain,
          paymentFeePct,
          paymentFeeFixed,
        },
      ],
      orders,
      orderLines,
      shippingCostRules: demoData.shippingCostRules,
      adSpends: demoData.adSpends.map((spend) => ({ amountSpent: spend.amountSpent })),
      useAllocatedAdSpend: false,
      expenses: demoData.expenses.map((expense) => ({
        shopId: expense.shopId,
        amount: expense.amount,
        frequency: expense.frequency,
        startDate: new Date(expense.startDate),
        endDate: expense.endDate ? new Date(expense.endDate) : null,
      })),
      totalOrders: orders.length,
    },
  );

  assert.ok(Math.abs(result.totals.totalRevenue - totals.totalRevenue) < 1e-8);
  assert.ok(Math.abs(result.totals.totalCost - totals.totalCost) < 1e-8);
  assert.ok(Math.abs(result.totals.totalAdSpend - totals.totalAdSpend) < 1e-8);
  assert.ok(Math.abs(result.totals.profit - totals.profit) < 1e-8);
  assert.ok(Math.abs(result.totalPaymentFees - totalPaymentFees) < 1e-8);
  assert.ok(Math.abs(result.totalExpenses - totalExpenses) < 1e-8);
  assert.ok(Math.abs(result.averageOrderValue - expectedAverageOrderValue) < 1e-8);
  assert.ok(Math.abs(result.netRevenueAfterFees - expectedNetRevenueAfterFees) < 1e-8);
});
