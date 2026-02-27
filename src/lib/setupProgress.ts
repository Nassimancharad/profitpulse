type SetupStepId = "connect_store" | "sync_store" | "connect_ads" | "add_costs";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  description: string;
  href: string;
  complete: boolean;
};

export type SetupProgressInput = {
  shopDomain: string;
  hasShopConnection: boolean;
  hasShopifyData: boolean;
  hasMetaConnection: boolean;
  hasCostInputs: boolean;
};

export type SetupProgress = {
  steps: SetupStep[];
  totalSteps: number;
  completedSteps: number;
  completionRatio: number;
  isComplete: boolean;
};

export function buildSetupProgress(input: SetupProgressInput): SetupProgress {
  const shopQuery = `shop=${encodeURIComponent(input.shopDomain)}`;
  const steps: SetupStep[] = [
    {
      id: "connect_store",
      title: "Connect store",
      description: "Install ProfitPulse in Shopify and authorize store access.",
      href: `/connections?${shopQuery}`,
      complete: input.hasShopConnection,
    },
    {
      id: "sync_store",
      title: "Sync orders",
      description: "Run your first Shopify sync so revenue and orders are available.",
      href: `/dashboard?${shopQuery}`,
      complete: input.hasShopifyData,
    },
    {
      id: "connect_ads",
      title: "Connect ads",
      description: "Connect Meta ad accounts to import spend and ROAS context.",
      href: `/connections?${shopQuery}`,
      complete: input.hasMetaConnection,
    },
    {
      id: "add_costs",
      title: "Add costs",
      description: "Set processor fees or recurring expenses to unlock net profit.",
      href: `/costs?${shopQuery}`,
      complete: input.hasCostInputs,
    },
  ];

  const completedSteps = steps.filter((step) => step.complete).length;
  const totalSteps = steps.length;
  const completionRatio = totalSteps === 0 ? 0 : completedSteps / totalSteps;
  return {
    steps,
    totalSteps,
    completedSteps,
    completionRatio,
    isComplete: completedSteps === totalSteps,
  };
}
