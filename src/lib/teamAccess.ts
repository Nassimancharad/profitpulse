import { ShopInviteStatus, ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { EMAIL_USER_PROVIDER, normalizeEmailAddress, upsertUserByProviderIdentity } from "@/lib/userAccounts";
import { hashInviteToken } from "@/lib/teamInvites";

export async function acceptInviteToken(input: {
  token: string;
  email: string;
  displayName?: string | null;
}) {
  const normalizedEmail = normalizeEmailAddress(input.email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false as const, status: 400, error: "Provide a valid email address." };
  }

  const tokenHash = hashInviteToken(input.token);
  const invite = await prisma.shopInvite.findFirst({
    where: {
      tokenHash,
      status: ShopInviteStatus.PENDING,
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      shopId: true,
      shop: {
        select: {
          shopDomain: true,
        },
      },
    },
  });

  if (!invite) {
    return { ok: false as const, status: 404, error: "Invite not found." };
  }
  if (invite.expiresAt < new Date()) {
    await prisma.shopInvite.update({
      where: { id: invite.id },
      data: { status: ShopInviteStatus.EXPIRED },
    });
    return { ok: false as const, status: 410, error: "Invite expired." };
  }
  if (normalizedEmail !== normalizeEmailAddress(invite.email)) {
    return { ok: false as const, status: 403, error: "This invite is for a different email address." };
  }

  const user = await upsertUserByProviderIdentity({
    provider: EMAIL_USER_PROVIDER,
    externalId: normalizedEmail,
    email: normalizedEmail,
    displayName: input.displayName ?? normalizedEmail,
  });

  await prisma.$transaction(async (tx) => {
    await tx.shopMembership.upsert({
      where: {
        userId_shopId: {
          userId: user.id,
          shopId: invite.shopId,
        },
      },
      create: {
        userId: user.id,
        shopId: invite.shopId,
        role: invite.role,
      },
      update: {
        role: invite.role,
      },
    });

    await tx.shopInvite.update({
      where: { id: invite.id },
      data: {
        status: ShopInviteStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });
  });

  return {
    ok: true as const,
    result: {
      email: normalizedEmail,
      role: invite.role,
      shopDomain: invite.shop.shopDomain,
      provider: EMAIL_USER_PROVIDER,
    },
  };
}

export function describeRole(role: ShopRole) {
  if (role === ShopRole.ADMIN) return "Admin";
  if (role === ShopRole.EDITOR) return "Editor";
  return "Viewer";
}
