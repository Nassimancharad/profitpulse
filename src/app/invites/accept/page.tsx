import { ShopInviteStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { InviteAcceptForm } from "./InviteAcceptForm";
import { hashInviteToken } from "@/lib/teamInvites";
import { describeRole } from "@/lib/teamAccess";

type InviteAcceptPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function InviteAcceptPage({ searchParams }: InviteAcceptPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const token = resolvedSearchParams?.token?.trim() ?? "";

  if (!token) {
    return <InviteMessage title="Missing invite token" detail="Open the full invite link to continue." />;
  }

  const invite = await prisma.shopInvite.findFirst({
    where: {
      tokenHash: hashInviteToken(token),
      status: ShopInviteStatus.PENDING,
    },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      shop: {
        select: {
          shopDomain: true,
        },
      },
    },
  });

  if (!invite) {
    return <InviteMessage title="Invite not found" detail="This invite is invalid, expired, or already used." />;
  }

  const isExpired = invite.expiresAt < new Date();
  if (isExpired) {
    return <InviteMessage title="Invite expired" detail="Ask a team member to generate a fresh invite link." />;
  }

  return (
    <main className="min-h-screen bg-[var(--pp-bg)] px-6 py-16 text-[color:var(--pp-foreground)]">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[color:var(--pp-border)] bg-white/70 p-8 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)]">
        <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Invite</p>
        <h1 className="mt-2 text-3xl font-semibold">Invite ready</h1>
        <p className="mt-3 text-sm text-[color:var(--pp-muted)]">
          This invite is valid for <strong>{invite.email}</strong> on <strong>{invite.shop.shopDomain}</strong> as <strong>{describeRole(invite.role)}</strong>.
        </p>
        <InviteAcceptForm
          token={token}
          email={invite.email}
          shopDomain={invite.shop.shopDomain}
          roleLabel={describeRole(invite.role)}
        />
      </div>
    </main>
  );
}

function InviteMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-[var(--pp-bg)] px-6 py-16 text-[color:var(--pp-foreground)]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[color:var(--pp-border)] bg-white/70 p-8 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)]">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-[color:var(--pp-muted)]">{detail}</p>
      </div>
    </main>
  );
}
