-- CreateEnum
CREATE TYPE "SyncResource" AS ENUM ('SHOPIFY', 'SHOPIFY_PAYMENTS', 'META');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'RUNNING', 'OK', 'ERROR');

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "resource" "SyncResource" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_shopId_resource_key" ON "SyncState"("shopId", "resource");

-- CreateIndex
CREATE INDEX "SyncState_shopId_status_idx" ON "SyncState"("shopId", "status");

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
