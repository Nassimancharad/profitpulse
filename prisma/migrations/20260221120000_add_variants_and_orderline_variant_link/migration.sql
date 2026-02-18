-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "costPerUnit" DOUBLE PRECISION,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "variantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Variant_shopId_shopifyVariantId_key" ON "Variant"("shopId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");

-- CreateIndex
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
