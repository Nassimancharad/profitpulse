"use client";

import { useState } from "react";

type Props = {
  productId: string;
  initialCost: number | null;
  shopDomain: string;
};

export function ProductCostEditor({ productId, initialCost, shopDomain }: Props) {
  const [value, setValue] = useState<string>(initialCost != null ? initialCost.toString() : "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleSave = async () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, costPerUnit: next, shop: shopDomain }),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div>
        <h3 className="text-lg font-semibold text-white">Cost per unit</h3>
        <p className="text-sm text-slate-300">Keep this updated to improve profit accuracy.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-white/15 bg-[var(--pp-bg)] px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-200 focus:ring-2 focus:ring-cyan-200/30"
          placeholder="0.00"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "saving" && "Saving..."}
          {status === "saved" && "Saved"}
          {status === "error" && "Retry"}
          {status === "idle" && "Save cost"}
        </button>
      </div>
      {status === "error" ? (
        <div className="text-sm text-amber-200">Enter a valid non-negative number and try again.</div>
      ) : null}
    </div>
  );
}
