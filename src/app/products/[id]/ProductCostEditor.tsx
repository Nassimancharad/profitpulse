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
    <div className="pp-card glass-surface flex flex-col gap-3 p-5">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Cost per unit</h3>
        <p className="text-sm text-[color:var(--pp-muted)]">Keep this updated to improve profit accuracy.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pp-input w-full max-w-xs"
          placeholder="0.00"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="pp-btn pp-btn-primary px-4 py-2 text-sm"
        >
          {status === "saving" && "Saving..."}
          {status === "saved" && "Saved"}
          {status === "error" && "Retry"}
          {status === "idle" && "Save cost"}
        </button>
      </div>
      {status === "error" ? (
        <div className="text-sm text-orange-700">Enter a valid non-negative number and try again.</div>
      ) : null}
    </div>
  );
}
