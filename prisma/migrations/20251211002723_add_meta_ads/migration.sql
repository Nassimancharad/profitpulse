/*
  Warnings:

  - Added the required column `adAccountId` to the `AdSpend` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdSpend" ADD COLUMN     "adAccountId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_shopId_adAccountId_key" ON "MetaAdAccount"("shopId", "adAccountId");

-- CreateIndex
CREATE INDEX "AdSpend_shopId_adAccountId_date_idx" ON "AdSpend"("shopId", "adAccountId", "date");

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
