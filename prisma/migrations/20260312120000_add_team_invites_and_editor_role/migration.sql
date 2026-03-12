ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'EDITOR';

CREATE TYPE "ShopInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "ShopInvite" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ShopRole" NOT NULL DEFAULT 'VIEWER',
    "status" "ShopInviteStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopInvite_tokenHash_key" ON "ShopInvite"("tokenHash");
CREATE INDEX "ShopInvite_shopId_status_idx" ON "ShopInvite"("shopId", "status");
CREATE INDEX "ShopInvite_email_status_idx" ON "ShopInvite"("email", "status");
CREATE UNIQUE INDEX "ShopInvite_shopId_email_status_key" ON "ShopInvite"("shopId", "email", "status");

ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
