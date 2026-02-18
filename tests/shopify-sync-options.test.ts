import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFullSync, parseMaxPages } from '../src/ingestion/shopify-sync';

test('parseMaxPages accepts only positive integers', () => {
  assert.equal(parseMaxPages('5'), 5);
  assert.equal(parseMaxPages('0'), undefined);
  assert.equal(parseMaxPages('-2'), undefined);
  assert.equal(parseMaxPages('abc'), undefined);
  assert.equal(parseMaxPages(null), undefined);
});

test('parseFullSync accepts explicit truthy flags', () => {
  assert.equal(parseFullSync('true'), true);
  assert.equal(parseFullSync('TRUE'), true);
  assert.equal(parseFullSync('1'), true);
  assert.equal(parseFullSync('yes'), true);
  assert.equal(parseFullSync('false'), false);
  assert.equal(parseFullSync('0'), false);
  assert.equal(parseFullSync(null), false);
});
