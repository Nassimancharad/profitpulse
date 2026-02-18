"use client";

import { useState } from "react";

type Props = {
  productId: string;
  initialCost: number | null;
  shopDomain: string;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    initialCost: number | null;
  }>;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function normalizeInitialValue(value: number | null) {
  return value != null ? value.toString() : "";
}

export function ProductCostEditor({ productId, initialCost, shopDomain, variants }: Props) {
  const [value, setValue] = useState<string>(normalizeInitialValue(initialCost));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [variantValues, setVariantValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((variant) => [variant.id, normalizeInitialValue(variant.initialCost)])),
  );
  const [variantStatus, setVariantStatus] = useState<Record<string, SaveStatus>>({});

  const handleSave = async () => {
    const trimmed = value.trim();
    const next = trimmed.length === 0 ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const response = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "product", productId, costPerUnit: next, shop: shopDomain }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  };

  const handleVariantSave = async (variantId: string) => {
    const rawValue = variantValues[variantId] ?? "";
    const trimmed = rawValue.trim();
    const next = trimmed.length === 0 ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setVariantStatus((prev) => ({ ...prev, [variantId]: "error" }));
      return;
    }
    setVariantStatus((prev) => ({ ...prev, [variantId]: "saving" }));
    try {
      const response = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "variant", variantId, costPerUnit: next, shop: shopDomain }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      setVariantStatus((prev) => ({ ...prev, [variantId]: "saved" }));
      setTimeout(() => {
        setVariantStatus((prev) => ({ ...prev, [variantId]: "idle" }));
      }, 2000);
    } catch {
      setVariantStatus((prev) => ({ ...prev, [variantId]: "error" }));
    }
  };

  return (
    <div className="pp-card glass-surface flex flex-col gap-5 p-5">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Cost per unit</h3>
        <p className="text-sm text-[color:var(--pp-muted)]">Set a product base cost, then override by variant when needed.</p>
      </div>

      <div className="rounded-xl border border-[color:var(--pp-border)] bg-white/55 p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[color:var(--pp-muted)]">Product default</p>
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
            {status === "idle" && "Save default"}
          </button>
        </div>
        {status === "error" ? (
          <div className="mt-2 text-sm text-orange-700">Enter a valid non-negative number, or clear to unset.</div>
        ) : null}
      </div>

      {variants.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--pp-muted)]">Variant overrides</p>
          {variants.map((variant) => {
            const currentStatus = variantStatus[variant.id] ?? "idle";
            return (
              <div
                key={variant.id}
                className="flex flex-col gap-3 rounded-xl border border-[color:var(--pp-border)] bg-white/55 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[color:var(--pp-foreground)]">{variant.title}</div>
                  {variant.sku ? (
                    <div className="text-xs text-[color:var(--pp-muted)]">SKU: {variant.sku}</div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={variantValues[variant.id] ?? ""}
                    onChange={(e) => setVariantValues((prev) => ({ ...prev, [variant.id]: e.target.value }))}
                    className="pp-input w-full sm:w-36"
                    placeholder="Use default"
                  />
                  <button
                    type="button"
                    onClick={() => handleVariantSave(variant.id)}
                    disabled={currentStatus === "saving"}
                    className="pp-btn pp-btn-secondary glass-inset px-3 py-2 text-xs"
                  >
                    {currentStatus === "saving" && "Saving..."}
                    {currentStatus === "saved" && "Saved"}
                    {currentStatus === "error" && "Retry"}
                    {currentStatus === "idle" && "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
