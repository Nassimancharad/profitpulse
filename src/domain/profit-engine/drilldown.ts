export type LineItemBreakdownInput = {
  lineId: string;
  quantity: number;
  lineRevenue: number;
  costPerUnit: number | null;
  productTitle: string;
  variantTitle?: string | null;
  variantSku?: string | null;
};

export type OrderCostAllocationInput = {
  shippingCost: number;
  adCostAllocated: number;
  paymentFee: number;
};

export type LineItemProfitBreakdown = {
  lineId: string;
  quantity: number;
  lineRevenue: number;
  costPerUnit: number | null;
  lineCost: number;
  grossProfit: number;
  allocationShare: number;
  allocatedShippingCost: number;
  allocatedAdCost: number;
  allocatedPaymentFee: number;
  allocatedCosts: number;
  netLineProfit: number;
  margin: number;
  productTitle: string;
  variantTitle: string | null;
  variantSku: string | null;
};

export function buildLineItemProfitBreakdown(
  lines: LineItemBreakdownInput[],
  orderCosts: OrderCostAllocationInput,
): LineItemProfitBreakdown[] {
  if (lines.length === 0) return [];

  const totalRevenue = lines.reduce((sum, line) => sum + line.lineRevenue, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
  const equalShare = 1 / lines.length;

  return lines.map((line) => {
    let allocationShare = equalShare;
    if (totalRevenue > 0) {
      allocationShare = line.lineRevenue / totalRevenue;
    } else if (totalQuantity > 0) {
      allocationShare = Math.max(0, line.quantity) / totalQuantity;
    }

    const lineCost = line.costPerUnit != null ? line.costPerUnit * line.quantity : 0;
    const grossProfit = line.lineRevenue - lineCost;
    const allocatedShippingCost = orderCosts.shippingCost * allocationShare;
    const allocatedAdCost = orderCosts.adCostAllocated * allocationShare;
    const allocatedPaymentFee = orderCosts.paymentFee * allocationShare;
    const allocatedCosts = allocatedShippingCost + allocatedAdCost + allocatedPaymentFee;
    const netLineProfit = grossProfit - allocatedCosts;
    const margin = line.lineRevenue > 0 ? netLineProfit / line.lineRevenue : 0;

    return {
      lineId: line.lineId,
      quantity: line.quantity,
      lineRevenue: line.lineRevenue,
      costPerUnit: line.costPerUnit,
      lineCost,
      grossProfit,
      allocationShare,
      allocatedShippingCost,
      allocatedAdCost,
      allocatedPaymentFee,
      allocatedCosts,
      netLineProfit,
      margin,
      productTitle: line.productTitle,
      variantTitle: line.variantTitle ?? null,
      variantSku: line.variantSku ?? null,
    };
  });
}
