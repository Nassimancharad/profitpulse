import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateCogsForOrder,
  calculateNetProfitForOrder,
  calculateNetRevenueForOrder,
  calculatePaymentFeesForOrder,
  calculateRefundsForOrder,
  calculateShippingRevenueForOrder,
} from '../src/lib/profit';
import { resolveLineCostPerUnit } from '../src/domain/profit-engine/costs';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const demoData = JSON.parse(
  readFileSync(join(fixtureDir, 'fixtures', 'demo-data.json'), 'utf8'),
) as {
  orders: Array<{
    id: string;
    shippingRevenue: number;
    refundedProductAmount: number;
    refundedShippingAmount: number;
  }>;
  orderLines: Array<{ orderId: string; productId: string; quantity: number; lineRevenue: number }>;
  products: Array<{ id: string; costPerUnit: number | null }>;
};

function getProductRevenue(orderId: string) {
  return demoData.orderLines
    .filter((line) => line.orderId === orderId)
    .reduce((sum, line) => sum + line.lineRevenue, 0);
}

function getCogsLines(orderId: string) {
  return demoData.orderLines
    .filter((line) => line.orderId === orderId)
    .map((line) => {
      const product = demoData.products.find((item) => item.id === line.productId);
      return {
        quantity: line.quantity,
        costPerUnit: product?.costPerUnit ?? null,
      };
    });
}

test('calculateRefundsForOrder returns product and shipping refunds', () => {
  const order = demoData.orders.find((item) => item.id === 'order_1');
  assert.ok(order);

  const refunds = calculateRefundsForOrder({
    productRevenue: getProductRevenue(order.id),
    shippingRevenue: order.shippingRevenue,
    refundedProductAmount: order.refundedProductAmount,
    refundedShippingAmount: order.refundedShippingAmount,
  });

  assert.equal(refunds.refundedProductAmount, 10);
  assert.equal(refunds.refundedShippingAmount, 0);
  assert.equal(refunds.totalRefunded, 10);
});

test('calculateShippingRevenueForOrder nets refunded shipping', () => {
  const order = demoData.orders.find((item) => item.id === 'order_3');
  assert.ok(order);

  const shipping = calculateShippingRevenueForOrder({
    productRevenue: getProductRevenue(order.id),
    shippingRevenue: order.shippingRevenue,
    refundedProductAmount: order.refundedProductAmount,
    refundedShippingAmount: order.refundedShippingAmount,
  });

  assert.equal(shipping.grossShippingRevenue, 10);
  assert.equal(shipping.refundedShippingAmount, 10);
  assert.equal(shipping.netShippingRevenue, 0);
});

test('calculateNetRevenueForOrder matches existing net revenue behavior', () => {
  const order = demoData.orders.find((item) => item.id === 'order_1');
  assert.ok(order);

  const netRevenue = calculateNetRevenueForOrder({
    productRevenue: getProductRevenue(order.id),
    shippingRevenue: order.shippingRevenue,
    refundedProductAmount: order.refundedProductAmount,
    refundedShippingAmount: order.refundedShippingAmount,
  });

  assert.equal(netRevenue, 45);
});

test('calculateCogsForOrder sums cost per unit when available', () => {
  const cogs = calculateCogsForOrder(getCogsLines('order_1'));
  assert.equal(cogs, 26);
});

test('calculatePaymentFeesForOrder prefers actual fee when present', () => {
  const fee = calculatePaymentFeesForOrder({
    netRevenue: 45,
    paymentFeeActual: 2,
    paymentFeePct: 2.9,
    paymentFeeFixed: 0.3,
  });

  assert.equal(fee, 2);
});

test('calculatePaymentFeesForOrder estimates fee when actual missing', () => {
  const fee = calculatePaymentFeesForOrder({
    netRevenue: 45,
    paymentFeeActual: null,
    paymentFeePct: 2.9,
    paymentFeeFixed: 0.3,
  });

  assert.ok(Math.abs(fee - 1.605) < 1e-8);
});

test('calculateNetProfitForOrder matches order-level net profit math', () => {
  const netProfit = calculateNetProfitForOrder({
    netRevenue: 45,
    cogs: 26,
    shippingCost: 4,
    adCostAllocated: 11,
    paymentFee: 2,
  });

  assert.equal(netProfit, 2);
});

test('resolveLineCostPerUnit prefers variant override over product cost', () => {
  const resolved = resolveLineCostPerUnit({
    variantCostPerUnit: 9,
    productCostPerUnit: 4,
  });
  assert.equal(resolved, 9);
});

test('resolveLineCostPerUnit falls back to product cost when variant is missing', () => {
  const resolved = resolveLineCostPerUnit({
    variantCostPerUnit: null,
    productCostPerUnit: 4,
  });
  assert.equal(resolved, 4);
});
