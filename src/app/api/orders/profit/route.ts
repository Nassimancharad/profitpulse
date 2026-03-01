import { NextResponse } from "next/server";
import { getOrderProfitBreakdown, getShopIdByDomain } from "@/data";
import { parseOrderProfitQuery, toOrderProfitResponseDto } from "@/domain";
import { authenticateApiRequest, requireAuthorizedShop } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop. Provide ?shop=<myshop>.myshopify.com." }, { status: 400 });
  }
  const shopGuard = requireAuthorizedShop(auth, shopDomain);
  if (shopGuard) {
    return shopGuard;
  }

  const shop = await getShopIdByDomain(shopDomain);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const parsedQuery = parseOrderProfitQuery({
    shop: shop.shopDomain,
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
    timezone: shop.timezone,
  });

  if (!parsedQuery.ok) {
    return NextResponse.json({ error: parsedQuery.error }, { status: 400 });
  }

  const { query } = parsedQuery;
  const orderProfitResult = await getOrderProfitBreakdown(
    shop.id,
    query.startDate,
    query.endDate,
    shop.timezone,
    query.startDateKey,
    query.endDateKey,
  );
  const responseDto = toOrderProfitResponseDto(
    shop.shopDomain,
    query.startDateKey,
    query.endDateKey,
    orderProfitResult,
  );

  return NextResponse.json(responseDto);
}
