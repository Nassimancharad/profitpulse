"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global app render failed", {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6 py-10">
          <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-zinc-900">ProfitPulse is temporarily unavailable</h1>
            <p className="mt-3 text-sm text-zinc-600">
              A rendering error occurred. Please retry.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-lg border border-zinc-300 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
