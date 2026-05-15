import type { ShopPlan } from "@/data/plans";
import type { EmbeddedAppContext } from "@/lib/embeddedAppContext";
import { canUseFeature } from "@/lib/planGate";
import {
  formatPlanLabel,
  formatPlanStatus,
  PLAN_STATUS_OPTIONS,
  PLAN_TIER_OPTIONS,
} from "@/lib/planPresentation";
import { EmbeddedContextInputs } from "./EmbeddedContextInputs";

type ShopPlanPanelProps = {
  plan: ShopPlan;
  embeddedContext: EmbeddedAppContext;
};

export function ShopPlanPanel({ plan, embeddedContext }: ShopPlanPanelProps) {
  const planUpdatedAt = new Date(plan.planUpdatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const featureRows = [
    {
      label: "Shopify data sync",
      detail: "Included with every plan.",
      enabled: true,
    },
    {
      label: "Shopify Payments fee sync",
      detail: "Requires Standard or Premium.",
      enabled: canUseFeature({
        planTier: plan.planTier,
        planStatus: plan.planStatus,
        feature: "SHOPIFY_PAYMENTS_SYNC",
      }).ok,
    },
    {
      label: "Meta connections, sync, and campaign mapping",
      detail: "Requires Premium.",
      enabled: canUseFeature({
        planTier: plan.planTier,
        planStatus: plan.planStatus,
        feature: "META_CONNECTIONS",
      }).ok,
    },
  ];

  return (
    <section className="pp-card glass-surface mt-8 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Plan</p>
          <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Subscription access</h3>
          <p className="text-sm text-[color:var(--pp-muted)]">
            Current plan {plan.planTier.toLowerCase()} · {plan.planStatus.toLowerCase().replace("_", " ")} · Updated {planUpdatedAt}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PLAN_TIER_OPTIONS.map((tier) => (
          <form key={tier} action="/api/shop-plan" method="POST">
            <input type="hidden" name="shop" value={plan.shopDomain} />
            <EmbeddedContextInputs context={embeddedContext} />
            <input type="hidden" name="planTier" value={tier} />
            <button
              type="submit"
              disabled={plan.planTier === tier}
              className={`pp-btn px-3.5 py-2 text-sm ${
                plan.planTier === tier
                  ? "border-[color:rgba(242,122,40,0.28)] bg-[rgba(242,122,40,0.12)] text-[color:var(--pp-foreground)]"
                  : "pp-btn-secondary glass-inset"
              }`}
            >
              {tier === plan.planTier ? `${formatPlanLabel(tier)} current` : `Switch to ${formatPlanLabel(tier)}`}
            </button>
          </form>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PLAN_STATUS_OPTIONS.map((status) => (
          <form key={status} action="/api/shop-plan" method="POST">
            <input type="hidden" name="shop" value={plan.shopDomain} />
            <EmbeddedContextInputs context={embeddedContext} />
            <input type="hidden" name="planStatus" value={status} />
            <button
              type="submit"
              disabled={plan.planStatus === status}
              className={`pp-btn px-3.5 py-2 text-sm ${
                plan.planStatus === status
                  ? "border-[color:rgba(242,122,40,0.28)] bg-[rgba(242,122,40,0.12)] text-[color:var(--pp-foreground)]"
                  : "pp-btn-secondary glass-inset"
              }`}
            >
              {plan.planStatus === status ? `${formatPlanStatus(status)} current` : formatPlanStatus(status)}
            </button>
          </form>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {featureRows.map((feature) => (
          <div
            key={feature.label}
            className="flex items-start justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm"
          >
            <div>
              <div className="font-semibold text-[color:var(--pp-foreground)]">{feature.label}</div>
              <div className="text-[color:var(--pp-muted)]">{feature.detail}</div>
            </div>
            <span className={`text-xs font-semibold uppercase tracking-wide ${feature.enabled ? "text-emerald-700" : "text-amber-700"}`}>
              {feature.enabled ? "Enabled" : "Locked"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
