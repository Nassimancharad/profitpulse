import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateAdSpendByShop, allocateAdSpendByShopByDate } from '../src/lib/portfolioAdSpend';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const demoData = JSON.parse(
  readFileSync(join(fixtureDir, 'fixtures', 'multi-store-data.json'), 'utf8'),
) as {
  adAccounts: Array<{ shopId: string; adAccountId: string }>;
  adSpends: Array<{ shopId: string; adAccountId: string; date: string; amountSpent: number }>;
  revenues: Array<{ shopId: string; date: string; netRevenue: number }>;
};

test('allocateAdSpendByShop splits shared ad account spend by store net revenue', () => {
  const allocations = allocateAdSpendByShop(
    demoData.adAccounts,
    demoData.adSpends.map((row) => ({
      shopId: row.shopId,
      adAccountId: row.adAccountId,
      date: new Date(row.date),
      amountSpent: row.amountSpent,
    })),
    demoData.revenues.map((row) => ({
      shopId: row.shopId,
      date: new Date(row.date),
      netRevenue: row.netRevenue,
    })),
  );

  const allocationMap = new Map(allocations.map((row) => [row.shopId, row.totalAdSpend]));
  assert.equal(allocationMap.get('shop_a'), 75);
  assert.equal(allocationMap.get('shop_b'), 25);
});

test('allocateAdSpendByShopByDate keeps daily allocations stable', () => {
  const allocations = allocateAdSpendByShopByDate(
    demoData.adAccounts,
    demoData.adSpends.map((row) => ({
      shopId: row.shopId,
      adAccountId: row.adAccountId,
      date: new Date(row.date),
      amountSpent: row.amountSpent,
    })),
    demoData.revenues.map((row) => ({
      shopId: row.shopId,
      date: new Date(row.date),
      netRevenue: row.netRevenue,
    })),
  );

  const allocationMap = new Map(
    allocations.map((row) => [`${row.shopId}::${row.date.toISOString().slice(0, 10)}`, row.amountSpent]),
  );

  assert.equal(allocationMap.get('shop_a::2025-01-10'), 75);
  assert.equal(allocationMap.get('shop_b::2025-01-10'), 25);
});

test('allocateAdSpendByShopByDate preserves canonical ad-spend day keys for non-UTC shops', () => {
  const allocations = allocateAdSpendByShopByDate(
    [{ shopId: 'shop_a', adAccountId: 'act_1' }],
    [{ shopId: 'shop_a', adAccountId: 'act_1', date: new Date('2025-01-10T00:00:00.000Z'), amountSpent: 40 }],
    [{ shopId: 'shop_a', date: new Date('2025-01-10T16:00:00.000Z'), netRevenue: 100 }],
    'America/New_York',
  );

  const allocationMap = new Map(
    allocations.map((row) => [`${row.shopId}::${row.date.toISOString().slice(0, 10)}`, row.amountSpent]),
  );

  assert.equal(allocationMap.get('shop_a::2025-01-10'), 40);
  assert.equal(allocationMap.get('shop_a::2025-01-09'), undefined);
});
