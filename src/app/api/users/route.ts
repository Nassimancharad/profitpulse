import { NextResponse } from "next/server";
import { ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  authenticateApiRequest,
  isAuthorizedForShop,
  isAuthorizedForShopRole,
} from "@/lib/auth";

type UpdatePayload = {
  shop?: string;
  membershipId?: string;
  role?: ShopRole;
};

async function resolveShop(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  if (queryShop) {
    return queryShop;
  }

  try {
    const body = (await request.clone().json()) as { shop?: string };
    return typeof body.shop === "string" ? body.shop : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const shopDomain = await resolveShop(request);
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop query parameter." }, { status: 400 });
  }
  if (!isAuthorizedForShop(auth, shopDomain)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const memberships = await prisma.shopMembership.findMany({
    where: { shopId: shop.id },
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          externalId: true,
          email: true,
          displayName: true,
        },
      },
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    shop: { shopDomain: shop.shopDomain },
    members: memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      joinedAt: membership.createdAt,
      user: membership.user,
      isCurrentUser: auth.actorExternalId
        ? membership.user.externalId === auth.actorExternalId
        : false,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as UpdatePayload | null;
  const shopDomain = typeof body?.shop === "string" ? body.shop : null;
  const membershipId = typeof body?.membershipId === "string" ? body.membershipId : null;
  const role = body?.role === ShopRole.ADMIN ? ShopRole.ADMIN : body?.role === ShopRole.VIEWER ? ShopRole.VIEWER : null;

  if (!shopDomain || !membershipId || !role) {
    return NextResponse.json(
      { error: "shop, membershipId, and role are required." },
      { status: 400 },
    );
  }
  if (!isAuthorizedForShopRole(auth, shopDomain, ShopRole.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const membership = await prisma.shopMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      shopId: true,
      role: true,
      user: {
        select: {
          externalId: true,
        },
      },
    },
  });

  if (!membership || membership.shopId !== shop.id) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }

  if (membership.role === role) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.shopMembership.findUnique({
        where: { id: membership.id },
        select: { role: true, shopId: true },
      });

      if (!current || current.shopId !== shop.id) {
        throw new Error("membership_not_found");
      }

      if (current.role === ShopRole.ADMIN && role === ShopRole.VIEWER) {
        const adminCount = await tx.shopMembership.count({
          where: { shopId: shop.id, role: ShopRole.ADMIN },
        });
        if (adminCount <= 1) {
          throw new Error("last_admin");
        }
      }

      await tx.shopMembership.update({
        where: { id: membership.id },
        data: { role },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "last_admin") {
      return NextResponse.json(
        { error: "At least one admin is required per shop." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "membership_not_found") {
      return NextResponse.json({ error: "Membership not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated: {
      id: membership.id,
      role,
      isCurrentUser: auth.actorExternalId
        ? membership.user.externalId === auth.actorExternalId
        : false,
    },
  });
}
