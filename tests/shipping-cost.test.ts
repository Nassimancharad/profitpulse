import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShippingTotals, resolveShippingCost } from '../src/lib/shippingCost';

const rules = [
  { id: 'us-range', countryCode: 'US', minOrderValue: 0, maxOrderValue: 100, costAmount: 4 },
  { id: 'us-default', countryCode: 'US', minOrderValue: null, maxOrderValue: null, costAmount: 7 },
  { id: 'default-range', countryCode: null, minOrderValue: 0, maxOrderValue: 100, costAmount: 5 },
  { id: 'default', countryCode: null, minOrderValue: null, maxOrderValue: null, costAmount: 8 },
];

test('resolveShippingCost prioritizes country + range over fallbacks', () => {
  const match = resolveShippingCost(rules, 50, 'US');
  assert.ok(match);
  assert.equal(match?.matchedRuleId, 'us-range');
  assert.equal(match?.cost, 4);
});

test('resolveShippingCost falls back to country default when range does not match', () => {
  const match = resolveShippingCost(rules, 200, 'US');
  assert.ok(match);
  assert.equal(match?.matchedRuleId, 'us-default');
  assert.equal(match?.cost, 7);
});

test('resolveShippingCost falls back to default rules when no country match', () => {
  const match = resolveShippingCost(rules, 50, 'CA');
  assert.ok(match);
  assert.equal(match?.matchedRuleId, 'default-range');
  assert.equal(match?.cost, 5);
});

test('resolveShippingCost uses default with no range as final fallback', () => {
  const match = resolveShippingCost(rules, 200, 'CA');
  assert.ok(match);
  assert.equal(match?.matchedRuleId, 'default');
  assert.equal(match?.cost, 8);
});

test('calculateShippingTotals warns when no rule matches', () => {
  const totals = calculateShippingTotals(
    [
      {
        id: 'order-1',
        orderValue: 25,
        shippingRevenue: 5,
        refundedShippingAmount: 0,
        shippingCost: null,
        shippingCountryCode: 'US',
      },
    ],
    [],
  );

  assert.equal(totals.shippingRevenue, 5);
  assert.equal(totals.shippingCost, 0);
  assert.equal(totals.shippingMargin, 5);
  assert.equal(totals.warnings.length, 1);
});

test('calculateShippingTotals reduces revenue only when shipping is refunded', () => {
  const totals = calculateShippingTotals(
    [
      {
        id: 'order-2',
        orderValue: 30,
        shippingRevenue: 10,
        refundedShippingAmount: 4,
        shippingCost: 0,
        shippingCountryCode: 'US',
      },
    ],
    [],
  );

  assert.equal(totals.shippingRevenue, 6);
  assert.equal(totals.shippingCost, 0);
  assert.equal(totals.shippingMargin, 6);
});
