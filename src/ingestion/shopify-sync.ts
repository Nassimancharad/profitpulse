import prisma from "@/lib/prisma";
import {
  fetchShopifyOrders,
  fetchShopifyProducts,
  fetchShopifyShop,
  type ShopifyOrder,
  type ShopifyProduct,
} from "@/lib/shopifyAdmin";
import { normalizeCurrencyCode } from "@/lib/currency";
import { normalizeShopTimezone } from "@/lib/timezone";
import { acquireSyncLock, recordSyncError, recordSyncSuccess } from "@/data/syncState";
import { buildIdempotencyKey, finishJobRun, startJobRun } from "@/jobs";
import { logWarn } from "@/observability";

export type ShopifySyncResult = {
  shop: string;
  productsSynced: number;
  variantsSynced: number;
  ordersSynced: number;
  orderLinesSynced: number;
};

export function parseMaxPages(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : null;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseFullSync(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
  fullSync?: boolean;
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
  const createdAtMinIso = params.fullSync
    ? null
    : (lock.state.lastSyncedAt
        ? new Date(lock.state.lastSyncedAt.getTime() - overlapMs)
        : fallbackSince).toISOString();
  const idempotencyKey = buildIdempotencyKey([
    "shopify-sync",
    shopRecord.shopDomain,
    createdAtMinIso ? createdAtMinIso.slice(0, 10) : "all-history",
    params.maxPages ?? null,
    params.fullSync ? "full" : "delta",
  ]);
  const run = startJobRun({
    name: "shopify-sync",
    scope: shopRecord.shopDomain,
    cursor: [
      params.maxPages ? `maxPages=${params.maxPages}` : null,
      params.fullSync ? "fullSync=true" : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(",") || null,
    idempotencyKey,
  });

  let products: ShopifyProduct[] = [];
  let orders: ShopifyOrder[] = [];
  let shopCurrency: string | null = null;
  let shopTimezone: string | null = null;

  try {
    const options = params.maxPages ? { maxPages: params.maxPages } : undefined;
    const [shopSettings, productsResult, ordersResult] = await Promise.all([
      fetchShopifyShop(shopRecord.shopDomain, shopRecord.accessToken, options).catch((error) => {
        logWarn("shopify_shop_settings_failed", {
          shopDomain: shopRecord.shopDomain,
          error: error instanceof Error ? error.message : "Failed to fetch Shopify shop settings",
        });
        return null;
      }),
      fetchShopifyProducts(shopRecord.shopDomain, shopRecord.accessToken, options),
      fetchShopifyOrders(shopRecord.shopDomain, shopRecord.accessToken, createdAtMinIso ?? undefined, options),
    ]);
    products = productsResult;
    orders = ordersResult;
    shopCurrency = normalizeCurrencyCode(shopSettings?.currency);
    shopTimezone = normalizeShopTimezone(shopSettings?.iana_timezone);
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

  const shouldUpdateShopSettings =
    (shopCurrency && shopCurrency !== shopRecord.currency) ||
    (shopTimezone && shopTimezone !== shopRecord.timezone);

  if (shouldUpdateShopSettings) {
    try {
      await prisma.shop.update({
        where: { id: shopRecord.id },
        data: {
          ...(shopCurrency ? { currency: shopCurrency } : {}),
          ...(shopTimezone ? { timezone: shopTimezone } : {}),
        },
      });
    } catch (error) {
      logWarn("shop_settings_update_failed", {
        shopDomain: shopRecord.shopDomain,
        error: error instanceof Error ? error.message : "Failed to update shop settings",
      });
    }
  }

  try {
    const productIdMap = new Map<string, string>();
    const variantIdMap = new Map<string, string>();

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

      for (const variant of product.variants ?? []) {
        const shopifyVariantId = String(variant.id);
        const variantRecord = await prisma.variant.upsert({
          where: {
            shopId_shopifyVariantId: {
              shopId: shopRecord.id,
              shopifyVariantId,
            },
          },
          update: {
            productId: record.id,
            title: variant.title?.trim() || product.title,
            sku: variant.sku?.trim() || null,
          },
          create: {
            shopId: shopRecord.id,
            productId: record.id,
            shopifyVariantId,
            title: variant.title?.trim() || product.title,
            sku: variant.sku?.trim() || null,
          },
          select: { id: true },
        });
        variantIdMap.set(shopifyVariantId, variantRecord.id);
      }
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

      const lineCreates: Array<{
        orderId: string;
        productId: string;
        variantId: string | null;
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
        const shopifyVariantId = line.variant_id ? String(line.variant_id) : null;
        let variantId: string | null = null;

        if (shopifyVariantId) {
          variantId = variantIdMap.get(shopifyVariantId) ?? null;

          if (!variantId) {
            const fallbackVariant = await prisma.variant.upsert({
              where: {
                shopId_shopifyVariantId: {
                  shopId: shopRecord.id,
                  shopifyVariantId,
                },
              },
              update: {
                productId,
                title: line.title,
              },
              create: {
                shopId: shopRecord.id,
                productId,
                shopifyVariantId,
                title: line.title,
              },
              select: { id: true },
            });
            variantId = fallbackVariant.id;
            variantIdMap.set(shopifyVariantId, fallbackVariant.id);
          }
        }

        lineCreates.push({
          orderId: orderRecord.id,
          productId,
          variantId,
          quantity: line.quantity ?? 0,
          lineRevenue: Number(line.price ?? 0) * (line.quantity ?? 0),
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.orderLine.deleteMany({ where: { orderId: orderRecord.id } });

        if (lineCreates.length > 0) {
          const batchSize = 500;
          for (let idx = 0; idx < lineCreates.length; idx += batchSize) {
            const slice = lineCreates.slice(idx, idx + batchSize);
            await tx.orderLine.createMany({ data: slice });
          }
        }
      });

      orderLinesSynced += lineCreates.length;

      ordersSynced += 1;
    }

    finishJobRun(run, "ok");
    await recordSyncSuccess({ shopId: shopRecord.id, resource: "SHOPIFY" });
    return {
      ok: true,
      result: {
        shop: shopRecord.shopDomain,
        productsSynced: productIdMap.size,
        variantsSynced: variantIdMap.size,
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
