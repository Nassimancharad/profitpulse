import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  fetchShopifyOrders,
  fetchShopifyProducts,
  ShopifyOrder,
  ShopifyProduct,
} from "@/lib/shopifyAdmin";

type SyncResult = {
  shop: string;
  productsSynced: number;
  ordersSynced: number;
  orderLinesSynced: number;
};

function pickPrimaryImage(product: ShopifyProduct) {
  const direct = product.image?.src;
  if (direct) return direct;
  const first = product.images?.find((img) => img?.src);
  return first?.src ?? null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");

  let bodyShop: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") {
      bodyShop = body.shop;
    }
  } catch {
    // ignore body parse errors; proceed with query param / fallback
  }

  const shopDomain = queryShop ?? bodyShop;

  const shopRecord = shopDomain
    ? await prisma.shop.findUnique({ where: { shopDomain } })
    : await prisma.shop.findFirst();

  if (!shopRecord) {
    return NextResponse.json(
      { error: "Shop not found. Provide ?shop=<myshop>.myshopify.com or create a shop via OAuth first." },
      { status: 404 },
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const createdAtMinIso = since.toISOString();

  let products: ShopifyProduct[] = [];
  let orders: ShopifyOrder[] = [];

  try {
    [products, orders] = await Promise.all([
      fetchShopifyProducts(shopRecord.shopDomain, shopRecord.accessToken),
      fetchShopifyOrders(shopRecord.shopDomain, shopRecord.accessToken, createdAtMinIso),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch from Shopify";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const productIdMap = new Map<string, string>(); // shopifyProductId -> internal id

  for (const product of products) {
    const shopifyProductId = String(product.id);
    const imageUrl = pickPrimaryImage(product);

    const record = await prisma.product.upsert({
      where: {
        shopId_shopifyProductId: {
          shopId: shopRecord.id,
          shopifyProductId,
        },
      },
      update: {
        title: product.title,
        imageUrl,
      },
      create: {
        shopId: shopRecord.id,
        shopifyProductId,
        title: product.title,
        imageUrl,
      },
      select: { id: true },
    });

    productIdMap.set(shopifyProductId, record.id);
  }

  let ordersSynced = 0;
  let orderLinesSynced = 0;

  for (const order of orders) {
    const createdAt = new Date(order.created_at);
    const totalPrice = Number(order.total_price ?? 0);
    const shippingFromSet = Number(order.total_shipping_price_set?.shop_money?.amount ?? 0);
    const shippingRevenue = Number.isFinite(shippingFromSet) && shippingFromSet > 0
      ? shippingFromSet
      : Array.isArray(order.shipping_lines)
        ? order.shipping_lines.reduce((sum, line) => {
            const value = Number(line?.price ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0)
        : 0;
    const shippingCountryCodeRaw =
      order.shipping_address?.country_code ?? order.shipping_address?.country ?? null;
    const shippingCountryCode =
      shippingCountryCodeRaw ? String(shippingCountryCodeRaw).toUpperCase() : null;
    const refunds = Array.isArray(order.refunds) ? order.refunds : [];
    let refundedProductAmount = 0;
    let refundedShippingAmount = 0;

    for (const refund of refunds) {
      const lineItems = Array.isArray(refund.refund_line_items)
        ? refund.refund_line_items
        : [];
      for (const item of lineItems) {
        const subtotal = Number(item?.subtotal ?? item?.total ?? 0);
        if (Number.isFinite(subtotal) && subtotal > 0) {
          refundedProductAmount += subtotal;
          continue;
        }
        const quantity = item?.quantity ?? item?.line_item?.quantity ?? 0;
        const price = Number(item?.line_item?.price ?? 0);
        if (Number.isFinite(price) && Number.isFinite(quantity)) {
          refundedProductAmount += price * quantity;
        }
      }

      const adjustments = Array.isArray(refund.order_adjustments)
        ? refund.order_adjustments
        : [];
      for (const adjustment of adjustments) {
        if (adjustment?.kind !== "shipping_refund") continue;
        const amount = Number(adjustment?.amount ?? 0);
        if (Number.isFinite(amount) && amount > 0) {
          refundedShippingAmount += amount;
        }
      }
    }

    if (!Number.isFinite(refundedProductAmount)) {
      refundedProductAmount = 0;
    }
    if (!Number.isFinite(refundedShippingAmount)) {
      refundedShippingAmount = 0;
    }

    const orderRecord = await prisma.order.upsert({
      where: {
        shopId_shopifyOrderId: {
          shopId: shopRecord.id,
          shopifyOrderId: String(order.id),
        },
      },
      update: {
        createdAt,
        totalPrice,
        shippingRevenue,
        shippingCountryCode,
        refundedProductAmount,
        refundedShippingAmount,
      },
      create: {
        shopId: shopRecord.id,
        shopifyOrderId: String(order.id),
        createdAt,
        totalPrice,
        shippingRevenue,
        shippingCountryCode,
        refundedProductAmount,
        refundedShippingAmount,
      },
      select: { id: true },
    });

    // Clear previous lines to avoid duplicates then insert fresh.
    await prisma.orderLine.deleteMany({ where: { orderId: orderRecord.id } });

    const lineCreates = [];

    for (const line of order.line_items ?? []) {
      if (!line.product_id) {
        continue; // skip non-product lines
      }

      const shopifyProductId = String(line.product_id);
      let productId = productIdMap.get(shopifyProductId);

      if (!productId) {
        const fallbackProduct = await prisma.product.upsert({
          where: {
            shopId_shopifyProductId: {
              shopId: shopRecord.id,
              shopifyProductId,
            },
          },
          update: {
            title: line.title,
          },
          create: {
            shopId: shopRecord.id,
            shopifyProductId,
            title: line.title,
          },
          select: { id: true },
        });

        productId = fallbackProduct.id;
      }

      if (!productId) {
        continue;
      }

      productIdMap.set(shopifyProductId, productId);

      const lineRevenue = Number(line.price ?? 0) * (line.quantity ?? 0);

      lineCreates.push({
        orderId: orderRecord.id,
        productId,
        quantity: line.quantity ?? 0,
        lineRevenue,
      });
    }

    if (lineCreates.length > 0) {
      await prisma.orderLine.createMany({
        data: lineCreates,
      });
      orderLinesSynced += lineCreates.length;
    }

    ordersSynced += 1;
  }

  const result: SyncResult = {
    shop: shopRecord.shopDomain,
    productsSynced: productIdMap.size,
    ordersSynced,
    orderLinesSynced,
  };

  return NextResponse.json({ ok: true, synced: result });
}
