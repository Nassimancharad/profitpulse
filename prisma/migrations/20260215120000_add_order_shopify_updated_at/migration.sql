ALTER TABLE "Order" ADD COLUMN "shopifyUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Order_shopifyUpdatedAt_idx" ON "Order"("shopifyUpdatedAt");
