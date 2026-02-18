const API_VERSION = "2025-01";

type FetchParams = Record<string, string | number | undefined | null>;
type FetchOptions = {
  timeoutMs?: number;
  maxPages?: number;
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

type ShopifyShop = {
  id?: number | null;
  name?: string | null;
  currency?: string | null;
  iana_timezone?: string | null;
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

async function shopifyGet<T>(
  shopDomain: string,
  accessToken: string,
  path: string,
  params?: FetchParams,
  options: FetchOptions = {},
): Promise<{ data: T; linkHeader: string | null }> {
  const relativePath = buildUrl(path, params);
  const baseUrl = path.startsWith("/shopify_payments")
    ? `https://${shopDomain}/admin`
    : shopifyBaseUrl(shopDomain);
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify request failed (${res.status} ${res.statusText}): ${body}`);
  }

  const json = (await res.json()) as T;
  return { data: json, linkHeader: res.headers.get("link") };
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
    const { data, linkHeader } = await shopifyGet<unknown>(
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
      fields: "id,created_at,total_price,shipping_lines,total_shipping_price_set,shipping_address,refunds,line_items",
      ...(createdAtMinIso ? { created_at_min: createdAtMinIso } : {}),
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

export async function fetchShopifyShop(
  shopDomain: string,
  accessToken: string,
  options?: FetchOptions,
): Promise<ShopifyShop | null> {
  const { data } = await shopifyGet<{ shop?: ShopifyShop }>(
    shopDomain,
    accessToken,
    "/shop.json",
    {
      fields: "id,name,currency,iana_timezone",
    },
    options,
  );
  return data.shop ?? null;
}

export type { ShopifyOrder, ShopifyOrderLineItem, ShopifyProduct, ShopifyPaymentTransaction, ShopifyShop };
