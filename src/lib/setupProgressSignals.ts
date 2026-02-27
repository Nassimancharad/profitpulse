type SyncStateLike = {
  resource: string;
  status: string;
  lastSyncedAt: Date | null;
};

type ExpenseLike = {
  shopId: string | null;
};

export function inferSetupSignals(input: {
  syncStates: SyncStateLike[];
  hasAnyOrderData: boolean;
  paymentFeePct: number | null | undefined;
  paymentFeeFixed: number | null | undefined;
  productCostCount: number;
  variantCostCount: number;
  expenses: ExpenseLike[];
  activeShopId: string | null | undefined;
}) {
  const hasShopifySync = input.syncStates.some((state) => {
    return state.resource === "SHOPIFY" && (state.status === "OK" || Boolean(state.lastSyncedAt));
  });
  const hasShopifyData = input.hasAnyOrderData || hasShopifySync;
  const hasCostInputs =
    (input.paymentFeePct ?? 0) > 0 ||
    (input.paymentFeeFixed ?? 0) > 0 ||
    input.productCostCount > 0 ||
    input.variantCostCount > 0 ||
    input.expenses.some((expense) => expense.shopId === null || expense.shopId === input.activeShopId);

  return {
    hasShopifyData,
    hasCostInputs,
  };
}
