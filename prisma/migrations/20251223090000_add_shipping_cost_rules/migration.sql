-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCountryCode" TEXT;

-- CreateTable
CREATE TABLE "ShippingCostRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "countryCode" TEXT,
    "minOrderValue" DOUBLE PRECISION,
    "maxOrderValue" DOUBLE PRECISION,
    "costAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingCostRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingCostRule_shopId_idx" ON "ShippingCostRule"("shopId");

-- AddForeignKey
ALTER TABLE "ShippingCostRule" ADD CONSTRAINT "ShippingCostRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
