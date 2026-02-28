-- CreateEnum
CREATE TYPE "ShopRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateTable
CREATE TABLE "AppUser" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'shopify',
  "externalId" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "role" "ShopRole" NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_provider_externalId_key" ON "AppUser"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMembership_userId_shopId_key" ON "ShopMembership"("userId", "shopId");

-- CreateIndex
CREATE INDEX "ShopMembership_shopId_role_idx" ON "ShopMembership"("shopId", "role");

-- CreateIndex
CREATE INDEX "ShopMembership_userId_idx" ON "ShopMembership"("userId");

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
