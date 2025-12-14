import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchMetaCampaigns } from "@/lib/meta";

type CampaignRow = {
  id: string;
  campaignId: string;
  name?: string | null;
  adAccountId: string;
};

async function parseShop(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  try {
    const body = await request.clone().json();
    if (body && typeof body.shop === "string") return body.shop;
  } catch {
    // ignore body parse errors
  }
  return queryShop;
}

export async function GET(request: Request) {
  const shopDomain = await parseShop(request);
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop (?shop=...)" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const campaigns = await prisma.metaCampaign.findMany({
    where: { shopId: shop.id },
    select: { id: true, campaignId: true, name: true, adAccountId: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const shopDomain = await parseShop(request);
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop (?shop=...)" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { metaAdAccounts: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  if (!shop.metaAdAccounts.length) {
    return NextResponse.json({ error: "No connected Meta ad accounts" }, { status: 400 });
  }

  const upserts: CampaignRow[] = [];

  for (const account of shop.metaAdAccounts) {
    const campaigns = await fetchMetaCampaigns(account.adAccountId, account.accessToken);
    for (const c of campaigns) {
      if (!c.id) continue;
      upserts.push({
        id: `${account.adAccountId}-${c.id}`,
        campaignId: c.id,
        name: c.name ?? null,
        adAccountId: account.adAccountId,
      });
      await prisma.metaCampaign.upsert({
        where: { shopId_campaignId: { shopId: shop.id, campaignId: c.id } },
        update: { name: c.name ?? null, adAccountId: account.adAccountId },
        create: {
          shopId: shop.id,
          adAccountId: account.adAccountId,
          campaignId: c.id,
          name: c.name ?? null,
        },
      });
    }
  }

  const campaigns = await prisma.metaCampaign.findMany({
    where: { shopId: shop.id },
    select: { id: true, campaignId: true, name: true, adAccountId: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ ok: true, campaigns });
}
