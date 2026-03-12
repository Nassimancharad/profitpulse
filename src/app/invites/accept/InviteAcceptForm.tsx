"use client";

import { useState } from "react";

type Props = {
  token: string;
  email: string;
  shopDomain: string;
  roleLabel: string;
};

export function InviteAcceptForm({ token, email, shopDomain, roleLabel }: Props) {
  const [formEmail, setFormEmail] = useState(email);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "accepted" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: formEmail,
          displayName,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to accept invite.");
      }

      setStatus("accepted");
      setMessage(
        "Invite accepted. The membership is ready for the upcoming standalone login flow.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to accept invite.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm text-[color:var(--pp-muted)]">
          Email
          <input
            type="email"
            value={formEmail}
            onChange={(event) => setFormEmail(event.target.value)}
            className="pp-input mt-1"
            required
          />
        </label>
        <label className="text-sm text-[color:var(--pp-muted)]">
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="pp-input mt-1"
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="glass-inset rounded-2xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-4 text-sm text-[color:var(--pp-muted)]">
        You are accepting <strong>{roleLabel}</strong> access to <strong>{shopDomain}</strong>.
      </div>

      <button
        type="submit"
        disabled={status === "saving" || status === "accepted"}
        className="pp-btn pp-btn-primary px-4 py-2 text-sm"
      >
        {status === "saving" ? "Accepting..." : status === "accepted" ? "Accepted" : "Accept invite"}
      </button>

      {message ? (
        <div className="glass-inset rounded-2xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
          {message}
        </div>
      ) : null}
    </form>
  );
}
