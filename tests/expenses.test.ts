import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateMonthlyExpenses, getTotalExpensesForView } from '../src/lib/expenses';

test('allocateMonthlyExpenses prorates partial month', () => {
  const allocations = allocateMonthlyExpenses(
    [
      {
        shopId: 'shop-1',
        amount: 100,
        frequency: 'monthly',
        startDate: new Date('2025-01-10T00:00:00.000Z'),
        endDate: null,
      },
    ],
    new Date('2025-01-01T00:00:00.000Z'),
    new Date('2025-01-31T23:59:59.999Z'),
  );

  const allocation = allocations.find((row) => row.shopId === 'shop-1');
  assert.ok(allocation);
  assert.ok(Math.abs((allocation?.allocatedAmount ?? 0) - 70.9677419355) < 1e-8);
});

test('allocateMonthlyExpenses keeps portfolio expenses separate', () => {
  const allocations = allocateMonthlyExpenses(
    [
      {
        shopId: null,
        amount: 50,
        frequency: 'monthly',
        startDate: new Date('2025-02-01T00:00:00.000Z'),
        endDate: null,
      },
      {
        shopId: 'shop-2',
        amount: 20,
        frequency: 'monthly',
        startDate: new Date('2025-02-01T00:00:00.000Z'),
        endDate: null,
      },
    ],
    new Date('2025-02-01T00:00:00.000Z'),
    new Date('2025-02-28T23:59:59.999Z'),
  );

  const portfolio = allocations.find((row) => row.shopId === null);
  const store = allocations.find((row) => row.shopId === 'shop-2');
  assert.ok(portfolio);
  assert.ok(store);
  assert.ok(Math.abs((portfolio?.allocatedAmount ?? 0) - 50) < 1e-8);
  assert.ok(Math.abs((store?.allocatedAmount ?? 0) - 20) < 1e-8);
});

test('getTotalExpensesForView splits portfolio expense by net revenue', () => {
  const allocations = [
    { shopId: null, allocatedAmount: 100 },
    { shopId: 'shop-1', allocatedAmount: 20 },
    { shopId: 'shop-2', allocatedAmount: 10 },
  ];
  const netRevenueByShop = new Map<string, number>([
    ['shop-1', 300],
    ['shop-2', 100],
  ]);

  const storeTotal = getTotalExpensesForView(allocations, netRevenueByShop, 'shop-1');
  const portfolioTotal = getTotalExpensesForView(allocations, netRevenueByShop, null);

  assert.ok(Math.abs(storeTotal - 95) < 1e-8);
  assert.ok(Math.abs(portfolioTotal - 130) < 1e-8);
});
