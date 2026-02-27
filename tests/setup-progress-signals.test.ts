import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSetupSignals } from "../src/lib/setupProgressSignals";

test("inferSetupSignals treats any historical order as synced data", () => {
  const signals = inferSetupSignals({
    syncStates: [],
    hasAnyOrderData: true,
    paymentFeePct: 0,
    paymentFeeFixed: 0,
    productCostCount: 0,
    variantCostCount: 0,
    expenses: [],
    activeShopId: "shop_1",
  });

  assert.equal(signals.hasShopifyData, true);
});

test("inferSetupSignals treats variant costs as cost inputs", () => {
  const signals = inferSetupSignals({
    syncStates: [],
    hasAnyOrderData: false,
    paymentFeePct: 0,
    paymentFeeFixed: 0,
    productCostCount: 0,
    variantCostCount: 2,
    expenses: [],
    activeShopId: "shop_1",
  });

  assert.equal(signals.hasCostInputs, true);
});
