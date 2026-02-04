"use client";

import { useEffect } from "react";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Dashboard render failed", {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="pp-card glass-surface p-10">
      <h2 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">Dashboard unavailable</h2>
      <p className="mt-3 text-[color:var(--pp-muted)]">
        We could not load dashboard data. Please retry.
      </p>
      <button
        type="button"
        onClick={reset}
        className="pp-btn pp-btn-primary mt-6 px-4 py-2 text-sm"
      >
        Retry
      </button>
    </div>
  );
}
