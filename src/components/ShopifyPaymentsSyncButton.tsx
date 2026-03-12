"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  shopDomain: string;
  canManage?: boolean;
};

export function ShopifyPaymentsSyncButton({ shopDomain, canManage = true }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => setStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleClick = async () => {
    if (status === "loading" || !canManage) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/shopify-payments/sync?shop=${encodeURIComponent(shopDomain)}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-pp-sync": "1",
        },
      });
      if (!res.ok) {
        throw new Error(`Shopify Payments sync failed: ${res.status}`);
      }
      setStatus("success");
      router.refresh();
    } catch (error) {
      console.error("Shopify Payments sync failed", error);
      setStatus("error");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading" || !canManage}
      className="pp-btn pp-btn-secondary glass-inset px-3.5 py-2 text-sm"
    >
      {status === "loading" && "Syncing fees"}
      {status === "success" && "Fees synced"}
      {status === "error" && "Retry fees"}
      {status === "idle" && (canManage ? "Sync fees" : "Unavailable")}
    </button>
  );
}
