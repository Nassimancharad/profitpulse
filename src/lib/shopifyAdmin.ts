const API_VERSION = "2025-01";

type FetchParams = Record<string, string | number | undefined | null>;

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

type ShopifyOrder = {
  id: number;
  created_at: string;
  total_price: string;
  line_items: ShopifyOrderLineItem[];
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
): Promise<{ data: T; linkHeader: string | null }> {
  const relativePath = buildUrl(path, params);
  const res = await fetch(`${shopifyBaseUrl(shopDomain)}${relativePath}`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

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
  extractItems: (data: unknown) => TItem[],
  params?: FetchParams,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let pageInfo: string | null = null;

  do {
    const pageParams = { ...params, ...(pageInfo ? { page_info: pageInfo } : {}) };
    const { data, linkHeader } = await shopifyGet<unknown>(
      shopDomain,
      accessToken,
      path,
      pageParams,
    );
    const pageItems = extractItems(data);
    items.push(...pageItems);
    pageInfo = parseNextPageInfo(linkHeader);
  } while (pageInfo);

  return items;
}

export async function fetchShopifyProducts(
  shopDomain: string,
  accessToken: string,
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
  );
}

export async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string,
  createdAtMinIso?: string,
): Promise<ShopifyOrder[]> {
  return fetchPaginated<ShopifyOrder>(
    shopDomain,
    accessToken,
    "/orders.json",
    (data) => data.orders ?? [],
    {
      limit: 250,
      status: "any",
      fields: "id,created_at,total_price,line_items",
      ...(createdAtMinIso ? { created_at_min: createdAtMinIso } : {}),
    },
  );
}

export type { ShopifyOrder, ShopifyOrderLineItem, ShopifyProduct };
