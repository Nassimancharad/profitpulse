CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requestedFromIp" TEXT,
    "requestedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");
CREATE INDEX "MagicLinkToken_email_expiresAt_idx" ON "MagicLinkToken"("email", "expiresAt");
CREATE INDEX "MagicLinkToken_userId_expiresAt_idx" ON "MagicLinkToken"("userId", "expiresAt");
CREATE INDEX "MagicLinkToken_expiresAt_consumedAt_idx" ON "MagicLinkToken"("expiresAt", "consumedAt");

ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
