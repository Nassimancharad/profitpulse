import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBoundsForDateKey, normalizeShopTimezone, toTimeZoneDateKey } from '../src/lib/timezone';

test('normalizeShopTimezone falls back to UTC for invalid values', () => {
  assert.equal(normalizeShopTimezone('America/New_York'), 'America/New_York');
  assert.equal(normalizeShopTimezone('Invalid/Timezone'), 'UTC');
  assert.equal(normalizeShopTimezone(null), 'UTC');
});

test('dayBoundsForDateKey returns UTC bounds for the selected local day', () => {
  const bounds = dayBoundsForDateKey('2025-01-10', 'America/New_York');
  assert.equal(bounds.start.toISOString(), '2025-01-10T05:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2025-01-11T04:59:59.999Z');
});

test('toTimeZoneDateKey maps instants to local date keys', () => {
  const beforeMidnight = new Date('2025-01-11T04:30:00.000Z');
  const afterMidnight = new Date('2025-01-11T05:30:00.000Z');
  assert.equal(toTimeZoneDateKey(beforeMidnight, 'America/New_York'), '2025-01-10');
  assert.equal(toTimeZoneDateKey(afterMidnight, 'America/New_York'), '2025-01-11');
});
