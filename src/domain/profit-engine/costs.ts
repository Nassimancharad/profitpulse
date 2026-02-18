export function resolveLineCostPerUnit(input: {
  variantCostPerUnit?: number | null;
  productCostPerUnit?: number | null;
}): number | null {
  if (input.variantCostPerUnit != null) {
    return input.variantCostPerUnit;
  }
  if (input.productCostPerUnit != null) {
    return input.productCostPerUnit;
  }
  return null;
}
