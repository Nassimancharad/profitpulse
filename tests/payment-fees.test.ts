import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaymentFee } from '../src/lib/paymentFees';

test('calculatePaymentFee applies percent plus fixed', () => {
  const fee = calculatePaymentFee(100, 2.9, 0.3);
  assert.ok(Math.abs(fee - 3.2) < 1e-8);
});

test('calculatePaymentFee returns 0 for non-positive revenue', () => {
  assert.equal(calculatePaymentFee(0, 2.9, 0.3), 0);
  assert.equal(calculatePaymentFee(-10, 2.9, 0.3), 0);
});
