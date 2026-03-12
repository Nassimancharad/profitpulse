"use client";

import { ShopInviteStatus, ShopRole } from "@prisma/client";
import { useMemo, useState } from "react";

type InviteItem = {
  id: string;
  email: string;
  role: ShopRole;
  status: ShopInviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

type Props = {
  shopDomain: string;
  initialInvites: InviteItem[];
};

type SubmitStatus = "idle" | "saving" | "error";

export function TeamInvitesPanel({ shopDomain, initialInvites }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShopRole>(ShopRole.VIEWER);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [invites, setInvites] = useState(initialInvites);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const sortedInvites = useMemo(
    () =>
      [...invites].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [invites],
  );

  const createInvite = async () => {
    setStatus("saving");
    setMessage(null);
    setInviteUrl(null);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shopDomain, email, role }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        invite?: InviteItem;
        inviteUrl?: string;
      };
      if (!response.ok || !payload.invite || !payload.inviteUrl) {
        throw new Error(payload.error ?? "Unable to create invite.");
      }

      setInvites((prev) => {
        const next = prev.filter((item) => item.id !== payload.invite?.id);
        return [payload.invite!, ...next];
      });
      setInviteUrl(payload.inviteUrl);
      setMessage("Invite link generated. Copy it now or regenerate it later.");
      setEmail("");
      setRole(ShopRole.VIEWER);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to create invite.");
    }
  };

  const regenerateInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    setMessage(null);
    setInviteUrl(null);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shopDomain, inviteId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        invite?: InviteItem;
        inviteUrl?: string;
      };
      if (!response.ok || !payload.invite || !payload.inviteUrl) {
        throw new Error(payload.error ?? "Unable to regenerate invite.");
      }

      setInvites((prev) => prev.map((item) => (item.id === inviteId ? payload.invite! : item)));
      setInviteUrl(payload.inviteUrl);
      setMessage(`Fresh invite link generated for ${payload.invite.email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to regenerate invite.");
    } finally {
      setBusyInviteId(null);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    setMessage(null);

    try {
      const response = await fetch(`/api/team/invites?shop=${encodeURIComponent(shopDomain)}&id=${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to revoke invite.");
      }

      setInvites((prev) => prev.filter((item) => item.id !== inviteId));
      setMessage("Invite revoked.");
      setInviteUrl(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke invite.");
    } finally {
      setBusyInviteId(null);
    }
  };

  const copyInviteUrl = async () => {
    if (!inviteUrl || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(inviteUrl);
    setMessage("Invite link copied.");
  };

  return (
    <section className="pp-card glass-surface p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Team</p>
          <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Invite access</h3>
          <p className="text-sm text-[color:var(--pp-muted)]">
            Generate invite links now. Email delivery and standalone account acceptance can be added later without changing these records.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_180px_auto]">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          className="pp-input"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as ShopRole)}
          className="pp-select"
        >
          <option value={ShopRole.ADMIN}>Admin</option>
          <option value={ShopRole.EDITOR}>Editor</option>
          <option value={ShopRole.VIEWER}>Viewer</option>
        </select>
        <button
          type="button"
          onClick={createInvite}
          disabled={status === "saving"}
          className="pp-btn pp-btn-primary px-4 py-2 text-sm"
        >
          {status === "saving" ? "Generating..." : "Generate invite"}
        </button>
      </div>

      {message ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
          {message}
        </div>
      ) : null}

      {inviteUrl ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--pp-muted)]">Invite link</div>
          <div className="mt-2 break-all text-sm text-[color:var(--pp-foreground)]">{inviteUrl}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copyInviteUrl} className="pp-btn pp-btn-secondary glass-inset px-3 py-2 text-xs">
              Copy link
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        {sortedInvites.length === 0 ? (
          <div className="glass-inset rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
            No invites created yet.
          </div>
        ) : (
          sortedInvites.map((invite) => {
            const pending = busyInviteId === invite.id;
            return (
              <div
                key={invite.id}
                className="rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[color:var(--pp-foreground)]">{invite.email}</div>
                    <div className="text-xs text-[color:var(--pp-muted)]">
                      {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => regenerateInvite(invite.id)}
                      disabled={pending}
                      className="pp-btn pp-btn-secondary glass-inset px-3 py-2 text-xs"
                    >
                      {pending ? "Working..." : "Generate fresh link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeInvite(invite.id)}
                      disabled={pending}
                      className="pp-btn px-3 py-2 text-xs text-rose-600 border-rose-300/60 bg-rose-200/40 hover:border-rose-300"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
