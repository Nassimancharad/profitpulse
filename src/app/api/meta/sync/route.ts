import { NextResponse } from "next/server";
import { syncMetaSpend } from "@/ingestion";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const queryStart = url.searchParams.get("start");
  const queryEnd = url.searchParams.get("end");

  let bodyShop: string | null = null;
  let bodyStart: string | null = null;
  let bodyEnd: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
    if (body && typeof body.start === "string") bodyStart = body.start;
    if (body && typeof body.end === "string") bodyEnd = body.end;
  } catch {
    // no-op: query params remain source of truth
  }

  const result = await syncMetaSpend({
    shopDomain: queryShop ?? bodyShop,
    start: queryStart ?? bodyStart,
    end: queryEnd ?? bodyEnd,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
