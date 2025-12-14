-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaCampaign_shopId_adAccountId_idx" ON "MetaCampaign"("shopId", "adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_shopId_campaignId_key" ON "MetaCampaign"("shopId", "campaignId");

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
