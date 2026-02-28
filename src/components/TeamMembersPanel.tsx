"use client";

import { useEffect, useState } from "react";

type ShopRole = "ADMIN" | "VIEWER";

type Member = {
  id: string;
  role: ShopRole;
  user: {
    id: string;
    externalId: string;
    email: string | null;
    displayName: string | null;
  };
  isCurrentUser: boolean;
};

type Props = {
  shopDomain: string;
  canManage: boolean;
};

export function TeamMembersPanel({ shopDomain, canManage }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [members, setMembers] = useState<Member[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      setMessage(null);
      try {
        const response = await fetch(`/api/users?shop=${encodeURIComponent(shopDomain)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("load_failed");
        }

        const payload = (await response.json()) as { members?: Member[] };
        if (cancelled) {
          return;
        }

        setMembers(Array.isArray(payload.members) ? payload.members : []);
        setStatus("idle");
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [shopDomain]);

  const updateRole = async (membershipId: string, role: ShopRole) => {
    if (!canManage) {
      return;
    }

    setUpdatingId(membershipId);
    setMessage(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shopDomain,
          membershipId,
          role,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to update role.");
        return;
      }

      setMembers((prev) => prev.map((member) => (member.id === membershipId ? { ...member, role } : member)));
      setMessage("Role updated.");
    } catch {
      setMessage("Unable to update role.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="pp-card glass-surface p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Access</p>
          <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Team roles</h3>
          <p className="text-sm text-[color:var(--pp-muted)]">
            Admins can edit data and connections. Viewers have read-only access.
          </p>
        </div>
      </div>

      {!canManage ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-xs text-[color:var(--pp-muted)]">
          Your role is viewer. Contact an admin to change team access.
        </div>
      ) : null}

      {message ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-xs text-[color:var(--pp-muted)]">
          {message}
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
          Loading team members...
        </div>
      ) : status === "error" ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
          Could not load team members yet. Open the app in Shopify and try again.
        </div>
      ) : members.length === 0 ? (
        <div className="glass-inset mt-4 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 text-sm text-[color:var(--pp-muted)]">
          No members yet. Users are added automatically when they open the app.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {members.map((member) => {
            const label = member.user.displayName || member.user.email || member.user.externalId;
            const pending = updatingId === member.id;
            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-xl border border-[color:var(--pp-border)] bg-white/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--pp-foreground)]">{label}</div>
                  <div className="text-xs text-[color:var(--pp-muted)]">
                    {member.user.email ?? "No email in Shopify token"}
                    {member.isCurrentUser ? " · You" : ""}
                  </div>
                </div>
                <select
                  value={member.role}
                  onChange={(event) => updateRole(member.id, event.target.value as ShopRole)}
                  disabled={!canManage || pending}
                  className="pp-select h-9 w-full sm:w-36"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
