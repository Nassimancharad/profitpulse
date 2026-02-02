import { calculatePaymentFee } from './payment-fees';

// Canonical term definitions: docs/profit-glossary.md
export type OrderLineTotalsInput = {
  quantity: number;
  lineRevenue: number;
  costPerUnit?: number | null;
};

export type AdSpendInput = {
  amountSpent: number;
};

export type OrderLineTotals = {
  totalRevenue: number;
  totalUnits: number;
  totalCost: number;
};

export type ProfitTotals = OrderLineTotals & {
  shippingRevenue: number;
  shippingCost: number;
  shippingMargin: number;
  refundedProductAmount: number;
  paymentFees: number;
  expenses: number;
  totalAdSpend: number;
  profit: number;
  profitMargin: number;
  roas: number | null;
};

export type OrderRevenueInput = {
  productRevenue: number;
  shippingRevenue: number;
  refundedProductAmount?: number | null;
  refundedShippingAmount?: number | null;
};

export type RefundTotals = {
  refundedProductAmount: number;
  refundedShippingAmount: number;
  totalRefunded: number;
};

export type ShippingRevenueTotals = {
  grossShippingRevenue: number;
  refundedShippingAmount: number;
  netShippingRevenue: number;
};

export type CogsLineInput = {
  quantity: number;
  costPerUnit: number | null;
};

export type PaymentFeeInput = {
  netRevenue: number;
  paymentFeeActual?: number | null;
  paymentFeePct?: number | null;
  paymentFeeFixed?: number | null;
};

export type NetProfitInput = {
  netRevenue: number;
  cogs: number;
  shippingCost: number;
  adCostAllocated: number;
  paymentFee: number;
  expenses?: number | null;
};

export function calculateOrderLineTotals(lines: OrderLineTotalsInput[]): OrderLineTotals {
  let totalRevenue = 0;
  let totalUnits = 0;
  let totalCost = 0;

  for (const line of lines) {
    const lineCost = line.costPerUnit != null ? line.quantity * line.costPerUnit : 0;
    totalRevenue += line.lineRevenue;
    totalUnits += line.quantity;
    totalCost += lineCost;
  }

  return { totalRevenue, totalUnits, totalCost };
}

export function calculateRefundsForOrder(order: OrderRevenueInput): RefundTotals {
  const refundedProductAmount = order.refundedProductAmount ?? 0;
  const refundedShippingAmount = order.refundedShippingAmount ?? 0;
  return {
    refundedProductAmount,
    refundedShippingAmount,
    totalRefunded: refundedProductAmount + refundedShippingAmount,
  };
}

export function calculateShippingRevenueForOrder(order: OrderRevenueInput): ShippingRevenueTotals {
  const grossShippingRevenue = order.shippingRevenue ?? 0;
  const refundedShippingAmount = order.refundedShippingAmount ?? 0;
  const netShippingRevenue = Math.max(0, grossShippingRevenue - refundedShippingAmount);
  return { grossShippingRevenue, refundedShippingAmount, netShippingRevenue };
}

export function calculateNetRevenueForOrder(order: OrderRevenueInput): number {
  const refundedProductAmount = order.refundedProductAmount ?? 0;
  const netProductRevenue = Math.max(0, order.productRevenue - refundedProductAmount);
  const { netShippingRevenue } = calculateShippingRevenueForOrder(order);
  return netProductRevenue + netShippingRevenue;
}

export function calculateCogsForOrder(lines: CogsLineInput[]): number {
  return lines.reduce((sum, line) => {
    if (line.costPerUnit == null) return sum;
    return sum + line.quantity * line.costPerUnit;
  }, 0);
}

export function calculatePaymentFeesForOrder(input: PaymentFeeInput): number {
  if (input.paymentFeeActual != null) {
    return input.paymentFeeActual;
  }
  const paymentFeePct = input.paymentFeePct ?? 0;
  const paymentFeeFixed = input.paymentFeeFixed ?? 0;
  return calculatePaymentFee(input.netRevenue, paymentFeePct, paymentFeeFixed);
}

export function calculateNetProfitForOrder(input: NetProfitInput): number {
  const expenses = input.expenses ?? 0;
  return input.netRevenue
    - input.cogs
    - input.shippingCost
    - input.adCostAllocated
    - input.paymentFee
    - expenses;
}

export function calculateProfitTotals(
  lines: OrderLineTotalsInput[],
  adSpends: AdSpendInput[],
  shippingTotals?: { shippingRevenue?: number; shippingCost?: number },
  refundTotals?: { refundedProductAmount?: number },
  paymentTotals?: { paymentFees?: number },
  expenseTotals?: { expenses?: number },
): ProfitTotals {
  const { totalRevenue, totalUnits, totalCost } = calculateOrderLineTotals(lines);
  const totalAdSpend = adSpends.reduce((sum, spend) => sum + spend.amountSpent, 0);
  const shippingRevenue = shippingTotals?.shippingRevenue ?? 0;
  const shippingCost = shippingTotals?.shippingCost ?? 0;
  const refundedProductAmount = refundTotals?.refundedProductAmount ?? 0;
  const netProductRevenue = Math.max(0, totalRevenue - refundedProductAmount);
  const combinedRevenue = netProductRevenue + shippingRevenue;
  const paymentFees = paymentTotals?.paymentFees ?? 0;
  const expenses = expenseTotals?.expenses ?? 0;
  const profit = combinedRevenue - totalCost - shippingCost - totalAdSpend - paymentFees - expenses;
  const profitMargin = combinedRevenue > 0 ? profit / combinedRevenue : 0;
  const roas = totalAdSpend > 0 ? combinedRevenue / totalAdSpend : null;

  return {
    totalRevenue: combinedRevenue,
    totalUnits,
    totalCost,
    shippingRevenue,
    shippingCost,
    shippingMargin: shippingRevenue - shippingCost,
    refundedProductAmount,
    paymentFees,
    expenses,
    totalAdSpend,
    profit,
    profitMargin,
    roas,
  };
}
