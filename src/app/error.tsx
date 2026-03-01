"use client";

import { useEffect } from "react";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("App route render failed", {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6 py-10">
      <div className="pp-card glass-surface w-full p-6">
        <h1 className="text-2xl font-semibold text-[color:var(--pp-foreground)]">Unable to load this page</h1>
        <p className="mt-3 text-sm text-[color:var(--pp-muted)]">
          Something went wrong while rendering. Please retry.
        </p>
        <button
          type="button"
          onClick={reset}
          className="pp-btn pp-btn-primary mt-6 px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
