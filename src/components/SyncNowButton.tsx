"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  shopDomain: string;
  size?: "md" | "lg";
  canManage?: boolean;
};

export function SyncNowButton({ shopDomain, size = "md", canManage = true }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => setStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const hardRefresh = () => {
    router.refresh();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleClick = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/sync?shop=${encodeURIComponent(shopDomain)}`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Sync failed: ${res.status}`);
      }
      setStatus("success");
      hardRefresh();
    } catch (error) {
      console.error("Sync failed", error);
      setStatus("error");
    }
  };

  const padding = size === "lg" ? "px-4.5 py-2.5" : "px-3.5 py-2";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading" || !canManage}
      className={`pp-btn pp-btn-secondary glass-inset w-full sm:w-auto ${padding} text-sm`}
    >
      <span aria-hidden>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4.5 w-4.5 text-[color:var(--pp-foreground)]"
        >
          <path d="M4 12a8 8 0 0 1 8-8" />
          <path d="M20 12a8 8 0 0 1-8 8" />
          <path d="M15 4h-3V1" />
          <path d="M9 20h3v3" />
        </svg>
      </span>
      {status === "loading" && "Syncing"}
      {status === "success" && "Synced"}
      {status === "error" && "Retry sync"}
      {status === "idle" && (canManage ? "Sync" : "View only")}
    </button>
  );
}
