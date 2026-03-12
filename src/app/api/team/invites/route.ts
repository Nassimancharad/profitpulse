import { NextResponse } from "next/server";
import { ShopInviteStatus, ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest, requireAuthorizedShopRole } from "@/lib/auth";
import {
  buildInviteUrl,
  createInviteToken,
  defaultInviteExpiry,
  hashInviteToken,
  isValidInviteRole,
  normalizeInviteEmail,
} from "@/lib/teamInvites";

async function resolveInvitedByUserId(actorUserId: string | null) {
  if (!actorUserId) {
    return null;
  }

  const user = await prisma.appUser.findUnique({
    where: { id: actorUserId },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function findShop(shopDomain: string) {
  return prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true },
  });
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop query parameter." }, { status: 400 });
  }

  const roleGuard = requireAuthorizedShopRole(auth, shopDomain, ShopRole.ADMIN);
  if (roleGuard) {
    return roleGuard;
  }

  const shop = await findShop(shopDomain);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const invites = await prisma.shopInvite.findMany({
    where: {
      shopId: shop.id,
      status: {
        in: [ShopInviteStatus.PENDING, ShopInviteStatus.ACCEPTED],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, invites });
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { shop?: string; email?: string; role?: ShopRole; inviteId?: string }
    | null;
  const shopDomain = typeof body?.shop === "string" ? body.shop : null;
  const rawEmail = typeof body?.email === "string" ? body.email : null;
  const inviteId = typeof body?.inviteId === "string" ? body.inviteId : null;
  const role = isValidInviteRole(body?.role) ? body.role : ShopRole.VIEWER;

  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop." }, { status: 400 });
  }

  const roleGuard = requireAuthorizedShopRole(auth, shopDomain, ShopRole.ADMIN);
  if (roleGuard) {
    return roleGuard;
  }

  const shop = await findShop(shopDomain);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const invitedByUserId = await resolveInvitedByUserId(auth.actorUserId);
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = defaultInviteExpiry();

  let invite;

  if (inviteId) {
    const existing = await prisma.shopInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, shopId: true, email: true, role: true, status: true },
    });
    if (!existing || existing.shopId !== shop.id) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    invite = await prisma.shopInvite.update({
      where: { id: existing.id },
      data: {
        tokenHash,
        expiresAt,
        invitedByUserId,
        status: ShopInviteStatus.PENDING,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });
  } else {
    const email = rawEmail ? normalizeInviteEmail(rawEmail) : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Provide a valid email address." }, { status: 400 });
    }

    const existing = await prisma.shopInvite.findFirst({
      where: {
        shopId: shop.id,
        email,
        status: ShopInviteStatus.PENDING,
      },
      select: { id: true },
    });

    if (existing) {
      invite = await prisma.shopInvite.update({
        where: { id: existing.id },
        data: {
          role,
          tokenHash,
          expiresAt,
          invitedByUserId,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    } else {
      invite = await prisma.shopInvite.create({
        data: {
          shopId: shop.id,
          email,
          role,
          status: ShopInviteStatus.PENDING,
          tokenHash,
          invitedByUserId,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    invite,
    inviteUrl: buildInviteUrl(token),
  });
}

export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const inviteId = url.searchParams.get("id");
  if (!shopDomain || !inviteId) {
    return NextResponse.json({ error: "Missing shop or invite id." }, { status: 400 });
  }

  const roleGuard = requireAuthorizedShopRole(auth, shopDomain, ShopRole.ADMIN);
  if (roleGuard) {
    return roleGuard;
  }

  const shop = await findShop(shopDomain);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const invite = await prisma.shopInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, shopId: true, status: true },
  });
  if (!invite || invite.shopId !== shop.id) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  await prisma.shopInvite.update({
    where: { id: invite.id },
    data: { status: ShopInviteStatus.REVOKED },
  });

  return NextResponse.json({ ok: true });
}
