import { NextResponse } from "next/server";
import { getOrderProfitBreakdown, getShopIdByDomain } from "@/data";
import { parseOrderProfitQuery, toOrderProfitResponseDto } from "@/domain";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = parseOrderProfitQuery({
    shop: url.searchParams.get("shop"),
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
  });

  if (!parsedQuery.ok) {
    return NextResponse.json({ error: parsedQuery.error }, { status: 400 });
  }

  const { query } = parsedQuery;

  const shop = await getShopIdByDomain(query.shopDomain);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const orderProfitResult = await getOrderProfitBreakdown(shop.id, query.startDate, query.endDate);
  const responseDto = toOrderProfitResponseDto(
    shop.shopDomain,
    query.startDate,
    query.endDate,
    orderProfitResult,
  );

  return NextResponse.json(responseDto);
}
