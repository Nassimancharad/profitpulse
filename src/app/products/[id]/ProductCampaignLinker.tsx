"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CampaignOption = { id: string; label: string };

type Props = {
  productId: string;
  linkedCampaigns: string[];
  campaigns: CampaignOption[];
  shopDomain?: string;
};

export function ProductCampaignLinker({ productId, linkedCampaigns, campaigns, shopDomain }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(linkedCampaigns);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = async (campaignId: string) => {
    const isLinked = selected.includes(campaignId);
    setBusyId(campaignId);
    try {
      await fetch("/api/campaign-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          campaignId,
          action: isLinked ? "remove" : "add",
        }),
      });
      setSelected((prev) =>
        isLinked ? prev.filter((id) => id !== campaignId) : [...prev, campaignId],
      );
    } finally {
      setBusyId(null);
    }
  };

  const refreshCampaigns = async () => {
    if (!shopDomain) return;
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
    if (!showList) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setShowList(false);
    }, 250);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Campaign links</h3>
          <p className="text-sm text-slate-300">Connect ad campaigns to this product.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shopDomain ? (
            <button
              type="button"
              onClick={refreshCampaigns}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15"
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
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      </div>
      {showList ? (
        campaigns.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
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
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => toggle(campaign.id)}
                      disabled={isBusy}
                      className="h-4 w-4 rounded border-white/20 bg-[var(--pp-bg)] text-cyan-300 focus:ring-1 focus:ring-cyan-200"
                    />
                    <span>{campaign.label}</span>
                  </div>
                  <span className="text-xs text-slate-300">{isLinked ? "Linked" : "Link"}</span>
                </label>
              );
            })}
          </div>
        )
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
          Load campaigns to link them to this product.
        </div>
      )}
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
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
      <div className="font-semibold text-white">Linked campaigns</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {linked.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] text-white"
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
