"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CampaignOption = { id: string; label: string };

type Props = {
  productId: string;
  linkedCampaigns: string[];
  campaigns: CampaignOption[];
  shopDomain?: string;
  canManage: boolean;
};

export function ProductCampaignLinker({ productId, linkedCampaigns, campaigns, shopDomain, canManage }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(linkedCampaigns);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggle = async (campaignId: string) => {
    if (!canManage) return;
    const isLinked = selected.includes(campaignId);
    setBusyId(campaignId);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/campaign-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          campaignId,
          action: isLinked ? "remove" : "add",
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        const fallback = isLinked
          ? "Could not unlink campaign."
          : "Could not link campaign.";
        const message = payload?.code === "PLAN_UPGRADE_REQUIRED"
          ? "Upgrade to Premium to manage campaign links."
          : payload?.code === "PLAN_INACTIVE"
            ? "Plan inactive. Reactivate your subscription to manage campaign links."
            : payload?.error ?? fallback;
        setErrorMessage(message);
        return;
      }

      setSelected((prev) =>
        isLinked ? prev.filter((id) => id !== campaignId) : [...prev, campaignId],
      );
    } finally {
      setBusyId(null);
    }
  };

  const refreshCampaigns = async () => {
    if (!shopDomain || !canManage) return;
    setSyncStatus("loading");
    try {
      const res = await fetch(`/api/meta/campaigns?shop=${encodeURIComponent(shopDomain)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setSyncStatus("done");
      setShowList(true);
      router.refresh();
    } catch {
      setSyncStatus("error");
    } finally {
      setTimeout(() => setSyncStatus("idle"), 2500);
    }
  };

  const handleSave = () => {
    if (!showList || !canManage) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setShowList(false);
    }, 250);
  };

  return (
    <div className="pp-card glass-surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Campaign links</h3>
          <p className="text-sm text-[color:var(--pp-muted)]">Connect ad campaigns to this product.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shopDomain ? (
            <button
              type="button"
              onClick={refreshCampaigns}
              disabled={!canManage}
              className="pp-btn pp-btn-secondary glass-inset px-3 py-2 text-xs"
            >
              {syncStatus === "loading"
                ? "Refreshing…"
                : syncStatus === "done"
                  ? showList
                    ? "Refreshed"
                    : "Loaded"
                  : syncStatus === "error"
                    ? "Retry"
                    : showList
                      ? "Refresh campaigns"
                      : "Load campaigns"}
            </button>
          ) : null}
          {showList ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canManage}
              className="pp-btn pp-btn-primary px-3 py-2 text-xs"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      </div>
      {showList ? (
        campaigns.length === 0 ? (
          <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-3 py-2 text-sm text-[color:var(--pp-muted)]">
            No campaigns found after refresh. Make sure ad spend has campaign IDs.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {campaigns.map((campaign) => {
              const isLinked = selected.includes(campaign.id);
              const isBusy = busyId === campaign.id;
              return (
                <label
                  key={campaign.id}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-3 py-2 text-sm text-[color:var(--pp-foreground)] transition hover:border-[color:rgba(242,122,40,0.25)] hover:bg-white/70"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => toggle(campaign.id)}
                      disabled={isBusy || !canManage}
                      className="h-4 w-4 rounded border-[color:var(--pp-border)] bg-white text-[color:var(--pp-accent)] focus:ring-2 focus:ring-[rgba(242,122,40,0.35)]"
                    />
                    <span>{campaign.label}</span>
                  </div>
                  <span className="text-xs text-[color:var(--pp-muted)]">{isLinked ? "Linked" : "Link"}</span>
                </label>
              );
            })}
          </div>
        )
      ) : (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-3 py-2 text-sm text-[color:var(--pp-muted)]">
          Load campaigns to link them to this product.
        </div>
      )}
      {errorMessage ? (
        <div className="glass-inset mt-3 rounded-xl border border-amber-300/60 bg-amber-100/60 px-3 py-2 text-xs text-amber-700">
          {errorMessage}
        </div>
      ) : null}
      <LinkedSummary campaigns={campaigns} selected={selected} />
    </div>
  );
}

function LinkedSummary({
  campaigns,
  selected,
}: {
  campaigns: CampaignOption[];
  selected: string[];
}) {
  const linked = campaigns.filter((c) => selected.includes(c.id));
  if (linked.length === 0) {
    return null;
  }
  return (
    <div className="glass-inset mt-3 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-3 py-2 text-xs text-[color:var(--pp-muted)]">
      <div className="font-semibold text-[color:var(--pp-foreground)]">Linked campaigns</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {linked.map((c) => (
          <span
            key={c.id}
            className="pp-badge glass-inset px-2 py-0.5 text-[11px] text-[color:var(--pp-foreground)]"
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
