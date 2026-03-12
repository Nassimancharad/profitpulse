CREATE TABLE "AuthRateLimitEvent" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthRateLimitEvent_scope_key_createdAt_idx" ON "AuthRateLimitEvent"("scope", "key", "createdAt");
CREATE INDEX "AuthRateLimitEvent_createdAt_idx" ON "AuthRateLimitEvent"("createdAt");
