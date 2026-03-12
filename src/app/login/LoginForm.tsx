"use client";

import { useState } from "react";

type LoginFormProps = {
  initialEmail?: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string; previewUrl: string | null }
  | { status: "error"; message: string };

export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const response = await fetch("/api/auth/magic-link/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; message?: string; previewUrl?: string | null }
      | null;

    if (!response.ok || !data?.ok) {
      setState({
        status: "error",
        message: data?.error ?? "Could not send a magic link. Try again.",
      });
      return;
    }

    setState({
      status: "success",
      message: data.message ?? "If that address can sign in, a magic link is ready.",
      previewUrl: data.previewUrl ?? null,
    });
  }

  const disabled = state.status === "submitting";

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[color:var(--pp-foreground)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
            className="w-full rounded-2xl border border-[color:var(--pp-border)] bg-white/80 px-4 py-3 text-sm text-[color:var(--pp-foreground)] outline-none transition focus:border-[color:var(--pp-accent)] focus:ring-2 focus:ring-orange-200"
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--pp-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(242,122,40,0.9)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Preparing link..." : "Send magic link"}
        </button>
      </form>

      {state.status === "success" ? (
        <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/90 p-4 text-sm text-emerald-800">
          <p>{state.message}</p>
          {state.previewUrl ? (
            <p className="mt-3 break-all">
              Dev preview:{" "}
              <a className="font-medium underline" href={state.previewUrl}>
                {state.previewUrl}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-2xl border border-rose-300/60 bg-rose-50/90 p-4 text-sm text-rose-700">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
