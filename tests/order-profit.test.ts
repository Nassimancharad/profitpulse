import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateOrderProfitBreakdown } from '../src/lib/orderProfit';
import { calculateProfitTotals } from '../src/lib/profit';
import { calculateShippingTotals } from '../src/lib/shippingCost';
import { calculatePaymentFee } from '../src/lib/paymentFees';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const demoData = JSON.parse(
  readFileSync(join(fixtureDir, 'fixtures', 'demo-data.json'), 'utf8'),
) as {
  orders: Array<{
    id: string;
    shopifyOrderId: string;
    createdAt: string;
    shippingRevenue: number;
    shippingCost: number | null;
    shippingCountryCode: string | null;
    refundedProductAmount: number;
    refundedShippingAmount: number;
  }>;
  orderLines: Array<{ orderId: string; quantity: number; lineRevenue: number; productId: string }>;
  products: Array<{ id: string; costPerUnit: number | null }>;
  adSpends: Array<{ date: string; amountSpent: number }>;
  shippingCostRules: Array<{
    id: string;
    countryCode: string | null;
    minOrderValue: number | null;
    maxOrderValue: number | null;
    costAmount: number;
  }>;
};

function buildLineInputs() {
  return demoData.orderLines.map((line) => {
    const product = demoData.products.find((p) => p.id === line.productId);
    return {
      orderId: line.orderId,
      quantity: line.quantity,
      lineRevenue: line.lineRevenue,
      costPerUnit: product?.costPerUnit ?? null,
    };
  });
}

test('calculateOrderProfitBreakdown allocates daily ad spend by order net revenue', () => {
  const paymentFeePct = 2.9;
  const paymentFeeFixed = 0.3;
  const result = calculateOrderProfitBreakdown(
    demoData.orders.map((order) => ({
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      createdAt: new Date(order.createdAt),
      shippingRevenue: order.shippingRevenue,
      shippingCost: order.shippingCost,
      shippingCountryCode: order.shippingCountryCode,
      refundedProductAmount: order.refundedProductAmount,
      refundedShippingAmount: order.refundedShippingAmount,
      paymentFeeActual: order.shopifyOrderId === '1001' ? 2 : null,
      paymentFeePct,
      paymentFeeFixed,
    })),
    buildLineInputs(),
    demoData.adSpends.map((spend) => ({
      date: new Date(spend.date),
      amountSpent: spend.amountSpent,
    })),
    demoData.shippingCostRules,
  );

  const orderMap = new Map(result.orders.map((order) => [order.shopifyOrderId, order]));

  assert.ok(Math.abs((orderMap.get('1001')?.adCostAllocated ?? 0) - 11.1176470588) < 1e-8);
  assert.ok(Math.abs((orderMap.get('1003')?.adCostAllocated ?? 0) - 9.8823529412) < 1e-8);
  assert.equal(orderMap.get('1002')?.adCostAllocated, 7.5);

  assert.ok(Math.abs((orderMap.get('1001')?.paymentFee ?? 0) - 2) < 1e-8);
  assert.ok(Math.abs((orderMap.get('1003')?.paymentFee ?? 0) - 1.46) < 1e-8);
  assert.ok(Math.abs((orderMap.get('1002')?.paymentFee ?? 0) - 0.88) < 1e-8);

  assert.equal(orderMap.get('1001')?.netProductRevenue, 40);
  assert.equal(orderMap.get('1001')?.netShippingRevenue, 5);
  assert.equal(orderMap.get('1001')?.refundsProduct, 10);
  assert.equal(orderMap.get('1001')?.refundsShipping, 0);
  assert.ok(Math.abs((orderMap.get('1001')?.paymentFeeEstimated ?? 0) - 1.605) < 1e-8);
  assert.equal(orderMap.get('1001')?.paymentFeeActual, 2);

  assert.equal(orderMap.get('1003')?.netProductRevenue, 40);
  assert.equal(orderMap.get('1003')?.netShippingRevenue, 0);
  assert.equal(orderMap.get('1003')?.refundsProduct, 0);
  assert.equal(orderMap.get('1003')?.refundsShipping, 10);
  assert.ok(Math.abs((orderMap.get('1003')?.paymentFeeEstimated ?? 0) - 1.46) < 1e-8);
  assert.equal(orderMap.get('1003')?.paymentFeeActual, null);

  assert.ok(Math.abs((orderMap.get('1001')?.netProfit ?? 0) - 1.8823529412) < 1e-8);
  assert.ok(Math.abs((orderMap.get('1003')?.netProfit ?? 0) - 12.6576470588) < 1e-8);
  assert.ok(Math.abs((orderMap.get('1002')?.netProfit ?? 0) + 4.38) < 1e-8);
  assert.equal(orderMap.get('1001')?.refundedProductAmount, 10);
  assert.equal(orderMap.get('1003')?.refundedShippingAmount, 10);
});

test('order-level breakdown sums to portfolio totals', () => {
  const paymentFeePct = 2.9;
  const paymentFeeFixed = 0.3;
  const result = calculateOrderProfitBreakdown(
    demoData.orders.map((order) => ({
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      createdAt: new Date(order.createdAt),
      shippingRevenue: order.shippingRevenue,
      shippingCost: order.shippingCost,
      shippingCountryCode: order.shippingCountryCode,
      refundedProductAmount: order.refundedProductAmount,
      refundedShippingAmount: order.refundedShippingAmount,
      paymentFeeActual: null,
      paymentFeePct,
      paymentFeeFixed,
    })),
    buildLineInputs(),
    demoData.adSpends.map((spend) => ({
      date: new Date(spend.date),
      amountSpent: spend.amountSpent,
    })),
    demoData.shippingCostRules,
  );

  const totalNetProfit = result.orders.reduce((sum, order) => sum + order.netProfit, 0);
  const shippingTotals = calculateShippingTotals(
    demoData.orders.map((order) => ({
      id: order.id,
      orderValue:
        demoData.orderLines
          .filter((line) => line.orderId === order.id)
          .reduce((sum, line) => sum + line.lineRevenue, 0) + order.shippingRevenue,
      shippingRevenue: order.shippingRevenue,
      refundedShippingAmount: order.refundedShippingAmount,
      shippingCost: order.shippingCost,
      shippingCountryCode: order.shippingCountryCode,
    })),
    demoData.shippingCostRules,
  );
  const profitTotals = calculateProfitTotals(
    demoData.orderLines.map((line) => {
      const product = demoData.products.find((p) => p.id === line.productId);
      return {
        quantity: line.quantity,
        lineRevenue: line.lineRevenue,
        costPerUnit: product?.costPerUnit ?? null,
      };
    }),
    demoData.adSpends.map((spend) => ({
      amountSpent: spend.amountSpent,
    })),
    {
      shippingRevenue: shippingTotals.shippingRevenue,
      shippingCost: shippingTotals.shippingCost,
    },
    {
      refundedProductAmount: demoData.orders.reduce(
        (sum, order) => sum + order.refundedProductAmount,
        0,
      ),
    },
    {
      paymentFees: calculatePaymentFee(45, paymentFeePct, paymentFeeFixed) +
        calculatePaymentFee(40, paymentFeePct, paymentFeeFixed) +
        calculatePaymentFee(20, paymentFeePct, paymentFeeFixed),
    },
    {
      expenses: 4,
    },
  );

  assert.ok(Math.abs(totalNetProfit - 10.555) < 1e-8);
  assert.ok(Math.abs(profitTotals.profit - 6.555) < 1e-8);
});
