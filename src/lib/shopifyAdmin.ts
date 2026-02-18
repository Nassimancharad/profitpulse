const API_VERSION = "2025-01";

type FetchParams = Record<string, string | number | undefined | null>;
type FetchOptions = {
  timeoutMs?: number;
  maxPages?: number;
  maxRetries?: number;
  baseDelayMs?: number;
};

type ShopifyProduct = {
  id: number;
  title: string;
  image?: { src?: string | null } | null;
  images?: { src?: string | null }[] | null;
};

type ShopifyOrderLineItem = {
  id: number;
  product_id: number | null;
  title: string;
  quantity: number;
  price: string; // stringified decimal
};

type ShopifyRefundLineItem = {
  line_item?: ShopifyOrderLineItem | null;
  quantity?: number | null;
  subtotal?: string | null;
  total?: string | null;
};

type ShopifyOrderAdjustment = {
  kind?: string | null;
  amount?: string | null;
};

type ShopifyRefund = {
  refund_line_items?: ShopifyRefundLineItem[] | null;
  order_adjustments?: ShopifyOrderAdjustment[] | null;
};

type ShopifyOrder = {
  id: number;
  created_at: string;
  updated_at?: string | null;
  total_price: string;
  shipping_lines?: { price?: string | null }[] | null;
  total_shipping_price_set?: {
    shop_money?: { amount?: string | null } | null;
  } | null;
  shipping_address?: { country_code?: string | null; country?: string | null } | null;
  refunds?: ShopifyRefund[] | null;
  line_items: ShopifyOrderLineItem[];
};

type ShopifyPaymentTransaction = {
  id: number;
  type?: string | null;
  source_id?: number | null;
  fee?: string | null;
  amount?: string | null;
  created_at?: string | null;
};

function shopifyBaseUrl(shopDomain: string) {
  return `https://${shopDomain}/admin/api/${API_VERSION}`;
}

function buildUrl(path: string, params?: FetchParams) {
  const url = new URL(path, "https://placeholder");
  const search = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      search.set(key, String(value));
    });
  }
  const query = search.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const section = part.split(";");
    if (section.length < 2) continue;
    const urlPart = section[0].trim();
    const relPart = section[1].trim();
    if (!relPart.includes('rel="next"')) continue;
    const match = urlPart.match(/<([^>]+)>/);
    if (!match) continue;
    const url = new URL(match[1]);
    const pageInfo = url.searchParams.get("page_info");
    if (pageInfo) return pageInfo;
  }
  return null;
}

function parseCallLimitHeader(value: string | null): { used: number; limit: number } | null {
  if (!value) return null;
  const [usedRaw, limitRaw] = value.split("/");
  const used = Number.parseInt(usedRaw ?? "", 10);
  const limit = Number.parseInt(limitRaw ?? "", 10);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  return { used, limit };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyGet<T>(
  shopDomain: string,
  accessToken: string,
  path: string,
  params?: FetchParams,
  options: FetchOptions = {},
): Promise<{ data: T; linkHeader: string | null; callLimitHeader: string | null }> {
  const relativePath = buildUrl(path, params);
  const baseUrl = path.startsWith("/shopify_payments")
    ? `https://${shopDomain}/admin`
    : shopifyBaseUrl(shopDomain);
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 750;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 10_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}${relativePath}`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const json = (await res.json()) as T;
      return {
        data: json,
        linkHeader: res.headers.get("link"),
        callLimitHeader: res.headers.get("x-shopify-shop-api-call-limit"),
      };
    }

    const retryAfter = res.headers.get("retry-after");
    const status = res.status;
    const isRetryable = status === 429 || (status >= 500 && status < 600);

    if (isRetryable && attempt < maxRetries) {
      const retryAfterMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : NaN;
      const delayMs = Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : baseDelayMs * Math.pow(2, attempt);
      await sleep(delayMs);
      continue;
    }

    const body = await res.text();
    throw new Error(`Shopify request failed (${res.status} ${res.statusText}): ${body}`);
  }

  throw new Error("Shopify request failed after retries");
}

async function fetchPaginated<TItem>(
  shopDomain: string,
  accessToken: string,
  path: string,
  extractItems: (data: any) => TItem[],
  params?: FetchParams,
  options: FetchOptions = {},
): Promise<TItem[]> {
  const items: TItem[] = [];
  let pageInfo: string | null = null;
  let pageCount = 0;

  do {
    const pageParams = { ...params, ...(pageInfo ? { page_info: pageInfo } : {}) };
    const { data, linkHeader, callLimitHeader } = await shopifyGet<unknown>(
      shopDomain,
      accessToken,
      path,
      pageParams,
      options,
    );
    const pageItems = extractItems(data);
    items.push(...pageItems);
    pageInfo = parseNextPageInfo(linkHeader);
    pageCount += 1;
    if (options.maxPages && pageCount >= options.maxPages) {
      break;
    }
    const callLimit = parseCallLimitHeader(callLimitHeader);
    if (callLimit && callLimit.limit > 0 && callLimit.used / callLimit.limit >= 0.8) {
      await sleep(1000);
    }
  } while (pageInfo);

  return items;
}

export async function fetchShopifyProducts(
  shopDomain: string,
  accessToken: string,
  options?: FetchOptions,
): Promise<ShopifyProduct[]> {
  return fetchPaginated<ShopifyProduct>(
    shopDomain,
    accessToken,
    "/products.json",
    (data) => data.products ?? [],
    {
      limit: 250,
      fields: "id,title,images,image",
    },
    options,
  );
}

export async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string,
  createdAtMinIso?: string,
  updatedAtMinIso?: string,
  options?: FetchOptions,
): Promise<ShopifyOrder[]> {
  return fetchPaginated<ShopifyOrder>(
    shopDomain,
    accessToken,
    "/orders.json",
    (data) => data.orders ?? [],
    {
      limit: 250,
      status: "any",
      fields:
        "id,created_at,updated_at,total_price,shipping_lines,total_shipping_price_set,shipping_address,refunds,line_items",
      ...(createdAtMinIso ? { created_at_min: createdAtMinIso } : {}),
      ...(updatedAtMinIso ? { updated_at_min: updatedAtMinIso } : {}),
    },
    options,
  );
}

export async function fetchShopifyPaymentTransactions(
  shopDomain: string,
  accessToken: string,
  createdAtMinIso?: string,
  options?: FetchOptions,
): Promise<ShopifyPaymentTransaction[]> {
  return fetchPaginated<ShopifyPaymentTransaction>(
    shopDomain,
    accessToken,
    "/shopify_payments/balance/transactions.json",
    (data) => data.transactions ?? [],
    {
      limit: 250,
      ...(createdAtMinIso ? { created_at_min: createdAtMinIso } : {}),
    },
    options,
  );
}

export type { ShopifyOrder, ShopifyOrderLineItem, ShopifyProduct, ShopifyPaymentTransaction };
