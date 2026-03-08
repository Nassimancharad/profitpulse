"use client";

import { useState } from "react";

function normalizeShopInput(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/\/.*$/, "");
}

function isValidShopDomain(value: string) {
  const normalized = normalizeShopInput(value);
  return normalized.endsWith(".myshopify.com") && normalized.split(".").length >= 3;
}

export function ShopConnectForm() {
  const [shopDomain, setShopDomain] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeShopInput(shopDomain);
    if (!isValidShopDomain(normalized)) {
      setError("Enter a valid shop domain like mystore.myshopify.com.");
      return;
    }
    setError("");
    const oauthUrl = `/api/auth/shopify/install?shop=${encodeURIComponent(normalized)}`;

    // Shopify OAuth must escape iframe context.
    try {
      if (window.top) {
        window.top.location.href = oauthUrl;
        return;
      }
    } catch {
      // Ignore cross-origin access issues and fall back to _top navigation.
    }

    window.open(oauthUrl, "_top");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <label className="block text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">
        Shopify store domain
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={shopDomain}
          onChange={(event) => setShopDomain(event.target.value)}
          placeholder="mystore.myshopify.com"
          className="pp-input px-4 py-2"
        />
        <button
          type="submit"
          className="pp-btn pp-btn-primary px-5 py-2 text-sm"
        >
          Connect shop
        </button>
      </div>
      <p className="text-xs text-[color:var(--pp-muted)]">
        Use the exact Shopify domain of your store to start OAuth.
      </p>
      {error ? <p className="text-xs text-orange-700">{error}</p> : null}
    </form>
  );
}
