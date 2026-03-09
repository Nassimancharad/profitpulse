-- Create plan enums
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STANDARD', 'PREMIUM');
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED');

-- Persist plan metadata per shop
ALTER TABLE "Shop"
  ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "planStatus" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "planUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
