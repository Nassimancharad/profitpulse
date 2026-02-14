export function calculatePaymentFee(
  netRevenue: number,
  paymentFeePct: number,
  paymentFeeFixed: number,
): number {
  if (!Number.isFinite(netRevenue) || netRevenue <= 0) {
    return 0;
  }
  const pct = Number.isFinite(paymentFeePct) ? paymentFeePct : 0;
  const fixed = Number.isFinite(paymentFeeFixed) ? paymentFeeFixed : 0;
  return netRevenue * (pct / 100) + fixed;
}
