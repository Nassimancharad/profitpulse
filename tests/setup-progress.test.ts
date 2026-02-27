import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupProgress } from '../src/lib/setupProgress';

test('buildSetupProgress returns zero completion when no steps are done', () => {
  const progress = buildSetupProgress({
    shopDomain: 'demo-shop.myshopify.com',
    hasShopConnection: false,
    hasShopifyData: false,
    hasMetaConnection: false,
    hasCostInputs: false,
  });

  assert.equal(progress.totalSteps, 4);
  assert.equal(progress.completedSteps, 0);
  assert.equal(progress.completionRatio, 0);
  assert.equal(progress.isComplete, false);
});

test('buildSetupProgress marks flow complete when all inputs are complete', () => {
  const progress = buildSetupProgress({
    shopDomain: 'demo-shop.myshopify.com',
    hasShopConnection: true,
    hasShopifyData: true,
    hasMetaConnection: true,
    hasCostInputs: true,
  });

  assert.equal(progress.completedSteps, 4);
  assert.equal(progress.completionRatio, 1);
  assert.equal(progress.isComplete, true);
  assert.equal(progress.steps.every((step) => step.complete), true);
  assert.equal(progress.steps.every((step) => step.href.includes('shop=demo-shop.myshopify.com')), true);
});
