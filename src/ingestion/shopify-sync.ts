import prisma from "@/lib/prisma";
import {
  fetchShopifyOrders,
  fetchShopifyProducts,
  type ShopifyOrder,
  type ShopifyProduct,
} from "@/lib/shopifyAdmin";
import { acquireSyncLock, recordSyncError, recordSyncSuccess } from "@/data/syncState";
import { buildIdempotencyKey, finishJobRun, startJobRun } from "@/jobs";

export type ShopifySyncResult = {
  shop: string;
  productsSynced: number;
  ordersSynced: number;
  orderLinesSynced: number;
};

export function parseMaxPages(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : null;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function pickPrimaryImage(product: ShopifyProduct) {
  const direct = product.image?.src;
  if (direct) return direct;
  const first = product.images?.find((img) => img?.src);
  return first?.src ?? null;
}

export async function syncShopifyStoreData(params: {
  shopDomain: string | null;
  maxPages?: number;
}): Promise<{ ok: true; result: ShopifySyncResult } | { ok: false; status: number; error: string }> {
  const shopRecord = params.shopDomain
    ? await prisma.shop.findUnique({ where: { shopDomain: params.shopDomain } })
    : await prisma.shop.findFirst();

  if (!shopRecord) {
    return {
      ok: false,
      status: 404,
      error: "Shop not found. Provide ?shop=<myshop>.myshopify.com or create a shop via OAuth first.",
    };
  }

  const lock = await acquireSyncLock({ shopId: shopRecord.id, resource: "SHOPIFY" });
  if (!lock.ok) {
    return {
      ok: false,
      status: 409,
      error: "Sync already running for this shop. Try again in a few minutes.",
    };
  }

  const fallbackSince = new Date();
  fallbackSince.setDate(fallbackSince.getDate() - 30);
  const overlapMs = 24 * 60 * 60 * 1000;
  const since = lock.state.lastSyncedAt
    ? new Date(lock.state.lastSyncedAt.getTime() - overlapMs)
    : fallbackSince;
  const createdAtMinIso = since.toISOString();
  const idempotencyKey = buildIdempotencyKey([
    "shopify-sync",
    shopRecord.shopDomain,
    createdAtMinIso.slice(0, 10),
    params.maxPages ?? null,
  ]);
  const run = startJobRun({
    name: "shopify-sync",
    scope: shopRecord.shopDomain,
    cursor: params.maxPages ? `maxPages=${params.maxPages}` : null,
    idempotencyKey,
  });

  let products: ShopifyProduct[] = [];
  let orders: ShopifyOrder[] = [];

  try {
    const options = params.maxPages ? { maxPages: params.maxPages } : undefined;
    [products, orders] = await Promise.all([
      fetchShopifyProducts(shopRecord.shopDomain, shopRecord.accessToken, options),
      fetchShopifyOrders(shopRecord.shopDomain, shopRecord.accessToken, createdAtMinIso, options),
    ]);
  } catch (error) {
    finishJobRun(run, "error");
    await recordSyncError({
      shopId: shopRecord.id,
      resource: "SHOPIFY",
      error: error instanceof Error ? error.message : "Failed to fetch from Shopify",
    });
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to fetch from Shopify",
    };
  }

  try {
    const productIdMap = new Map<string, string>();

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

      if (!Number.isFinite(refundedProductAmount)) refundedProductAmount = 0;
      if (!Number.isFinite(refundedShippingAmount)) refundedShippingAmount = 0;

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

      await prisma.orderLine.deleteMany({ where: { orderId: orderRecord.id } });

      const lineCreates: Array<{
        orderId: string;
        productId: string;
        quantity: number;
        lineRevenue: number;
      }> = [];

      for (const line of order.line_items ?? []) {
        if (!line.product_id) continue;

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

        if (!productId) continue;

        productIdMap.set(shopifyProductId, productId);

        lineCreates.push({
          orderId: orderRecord.id,
          productId,
          quantity: line.quantity ?? 0,
          lineRevenue: Number(line.price ?? 0) * (line.quantity ?? 0),
        });
      }

      if (lineCreates.length > 0) {
        const batchSize = 500;
        for (let idx = 0; idx < lineCreates.length; idx += batchSize) {
          const slice = lineCreates.slice(idx, idx + batchSize);
          await prisma.orderLine.createMany({ data: slice });
        }
        orderLinesSynced += lineCreates.length;
      }

      ordersSynced += 1;
    }

    finishJobRun(run, "ok");
    await recordSyncSuccess({ shopId: shopRecord.id, resource: "SHOPIFY" });
    return {
      ok: true,
      result: {
        shop: shopRecord.shopDomain,
        productsSynced: productIdMap.size,
        ordersSynced,
        orderLinesSynced,
      },
    };
  } catch (error) {
    finishJobRun(run, "error");
    await recordSyncError({
      shopId: shopRecord.id,
      resource: "SHOPIFY",
      error: error instanceof Error ? error.message : "Failed to persist Shopify data",
    });
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Failed to persist Shopify data",
    };
  }
}
