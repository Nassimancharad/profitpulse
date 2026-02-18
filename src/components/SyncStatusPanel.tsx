import { SyncResource, SyncStatus, type SyncState } from "@prisma/client";
import { MetaSyncButton } from "./MetaSyncButton";
import { ShopifyPaymentsSyncButton } from "./ShopifyPaymentsSyncButton";
import { SyncNowButton } from "./SyncNowButton";

type SyncStatusPanelProps = {
  shopDomain: string;
  states: SyncState[];
};

type StatusTone = "success" | "warning" | "error" | "neutral";

const RESOURCE_CONFIG: Record<
  SyncResource,
  {
    title: string;
    description: string;
    action: "shopify" | "meta" | "payments";
  }
> = {
  SHOPIFY: {
    title: "Shopify orders",
    description: "Products, orders, and line items.",
    action: "shopify",
  },
  SHOPIFY_PAYMENTS: {
    title: "Shopify Payments",
    description: "Processor fees and transaction costs.",
    action: "payments",
  },
  META: {
    title: "Meta ads",
    description: "Daily ad spend from connected accounts.",
    action: "meta",
  },
};

const RESOURCE_ORDER: SyncResource[] = Object.keys(RESOURCE_CONFIG) as SyncResource[];

function formatTimestamp(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusToneClasses(tone: StatusTone) {
  if (tone === "success") return "border-emerald-200/70 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200/70 bg-amber-50 text-amber-700";
  if (tone === "error") return "border-rose-200/70 bg-rose-50 text-rose-700";
  return "border-[color:var(--pp-border)] bg-white/70 text-[color:var(--pp-muted)]";
}

function isPaymentsUnsupported(state: SyncState | null) {
  if (!state || !state.error) return false;
  const message = state.error.toLowerCase();
  return message.includes("shopify payments") && (message.includes("not enabled") || message.includes("unsupported"));
}

function deriveStatus(resource: SyncResource, state: SyncState | null) {
  if (!state) {
    return {
      label: "Not synced",
      tone: "neutral" as StatusTone,
      detail: "No syncs recorded yet.",
      isRunning: false,
      isError: false,
      stalled: false,
      showAction: true,
    };
  }

  const now = new Date();
  const lockExpired = Boolean(state.lockExpiresAt && state.lockExpiresAt < now);

  if (state.status === SyncStatus.RUNNING) {
    if (lockExpired) {
      return {
        label: "Stalled",
        tone: "error" as StatusTone,
        detail: "Sync lock expired. Retry to restart the job.",
        isRunning: false,
        isError: true,
        stalled: true,
        showAction: true,
      };
    }
    return {
      label: "Running",
      tone: "warning" as StatusTone,
      detail: "Sync is currently running.",
      isRunning: true,
      isError: false,
      stalled: false,
      showAction: false,
    };
  }

  if (state.status === SyncStatus.ERROR) {
    if (resource === SyncResource.SHOPIFY_PAYMENTS && isPaymentsUnsupported(state)) {
      return {
        label: "Unavailable",
        tone: "warning" as StatusTone,
        detail: "Shopify Payments is not enabled for this store.",
        isRunning: false,
        isError: false,
        stalled: false,
        showAction: false,
      };
    }
    return {
      label: "Failed",
      tone: "error" as StatusTone,
      detail: "Last sync failed.",
      isRunning: false,
      isError: true,
      stalled: false,
      showAction: true,
    };
  }

  if (state.status === SyncStatus.OK) {
    return {
      label: "Synced",
      tone: "success" as StatusTone,
      detail: "Last sync completed successfully.",
      isRunning: false,
      isError: false,
      stalled: false,
      showAction: true,
    };
  }

  return {
    label: "Idle",
    tone: "neutral" as StatusTone,
    detail: "No sync running.",
    isRunning: false,
    isError: false,
    stalled: false,
    showAction: true,
  };
}

function renderAction(action: "shopify" | "meta" | "payments", shopDomain: string) {
  if (action === "meta") return <MetaSyncButton shopDomain={shopDomain} />;
  if (action === "payments") return <ShopifyPaymentsSyncButton shopDomain={shopDomain} />;
  return <SyncNowButton shopDomain={shopDomain} />;
}

export function SyncStatusPanel({ shopDomain, states }: SyncStatusPanelProps) {
  const byResource = new Map(states.map((state) => [state.resource, state]));

  return (
    <section className="pp-card glass-surface p-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Sync status</p>
        <h2 className="text-xl font-semibold text-[color:var(--pp-foreground)]">Latest data updates</h2>
        <p className="text-sm text-[color:var(--pp-muted)]">
          Track when each data source last synced and retry failed runs.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {RESOURCE_ORDER.map((resource) => {
          const state = byResource.get(resource) ?? null;
          const status = deriveStatus(resource, state);
          const config = RESOURCE_CONFIG[resource];
          if (!config) return null;
          const lastSyncedAt = state?.lastSyncedAt ?? null;
          const lastStartedAt = state?.lastStartedAt ?? null;
          const lastFinishedAt = state?.lastFinishedAt ?? null;

          return (
            <div
              key={resource}
              className="rounded-2xl border border-[color:var(--pp-border)] bg-white/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--pp-foreground)]">{config.title}</p>
                  <p className="text-xs text-[color:var(--pp-muted)]">{config.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`pp-badge border ${statusToneClasses(status.tone)}`}>
                    {status.label}
                  </span>
                  {status.showAction ? renderAction(config.action, shopDomain) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[color:var(--pp-muted)] sm:grid-cols-3">
                <div>
                  Last updated:{" "}
                  <span className="text-[color:var(--pp-foreground)]">
                    {formatTimestamp(lastSyncedAt)}
                  </span>
                </div>
                <div>
                  Last started:{" "}
                  <span className="text-[color:var(--pp-foreground)]">
                    {formatTimestamp(lastStartedAt)}
                  </span>
                </div>
                <div>
                  Last finished:{" "}
                  <span className="text-[color:var(--pp-foreground)]">
                    {formatTimestamp(lastFinishedAt)}
                  </span>
                </div>
              </div>

              {status.isError && state?.error ? (
                <div className="mt-3 rounded-xl border border-rose-200/70 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {state.error}
                </div>
              ) : null}

              {status.stalled && state?.lockExpiresAt ? (
                <div className="mt-2 text-xs text-[color:var(--pp-muted)]">
                  Lock expired at{" "}
                  <span className="text-[color:var(--pp-foreground)]">
                    {formatTimestamp(state.lockExpiresAt)}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
