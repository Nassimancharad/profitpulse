"use client";

import { useState } from "react";

type OverflowMenuProps = {
  shopDomain?: string;
};

/**
 * Sync button placed left of the date picker. Triggers a data refresh for the current shop.
 */
export function OverflowMenu({ shopDomain }: OverflowMenuProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleSync = async () => {
    if (!shopDomain || status === "loading") return;
    setStatus("loading");
    try {
      await fetch(`/api/sync?shop=${encodeURIComponent(shopDomain)}`, { method: "POST" });
      setStatus("done");
    } catch {
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSync}
      aria-label="Refresh data"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 text-white transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        aria-hidden
      >
        <path
          d="M21 6v5h-5"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 11a8 8 0 0 0-14.5-4.5"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M3 18v-5h5"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 13a8 8 0 0 0 14.5 4.5"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
        {status === "loading" ? "Syncing" : status === "done" ? "Synced" : "Sync"}
      </span>
    </button>
  );
}
