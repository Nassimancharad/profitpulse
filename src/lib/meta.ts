const META_API_VERSION = "v21.0";
const META_OAUTH_DIALOG = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;
const META_REQUEST_TIMEOUT_MS = 10_000;

type FetchOptions = {
  timeoutMs?: number;
  maxPages?: number;
};

type MetaEnv = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getMetaEnv(): MetaEnv {
  const { META_APP_ID, META_APP_SECRET, META_REDIRECT_URI } = process.env;
  const missing: string[] = [];
  if (!META_APP_ID) missing.push("META_APP_ID");
  if (!META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!META_REDIRECT_URI) missing.push("META_REDIRECT_URI");
  if (missing.length) {
    throw new Error(`Missing Meta env vars: ${missing.join(", ")}`);
  }
  return {
    appId: META_APP_ID!,
    appSecret: META_APP_SECRET!,
    redirectUri: META_REDIRECT_URI!,
  };
}

export function buildMetaAuthUrl(state: string, scope = "ads_read"): string {
  const env = getMetaEnv();
  const url = new URL(META_OAUTH_DIALOG);
  url.searchParams.set("client_id", env.appId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  return url.toString();
}

export async function exchangeCodeForShortLivedToken(code: string): Promise<string> {
  const env = getMetaEnv();
  const url = new URL(`${META_GRAPH_API}/oauth/access_token`);
  url.searchParams.set("client_id", env.appId);
  url.searchParams.set("client_secret", env.appSecret);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("code", code);

  const res = await fetchWithTimeout(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta token exchange failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Meta token exchange response missing access_token");
  }
  return json.access_token;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const env = getMetaEnv();
  const url = new URL(`${META_GRAPH_API}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", env.appId);
  url.searchParams.set("client_secret", env.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetchWithTimeout(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta long-lived exchange failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Meta long-lived exchange response missing access_token");
  }
  return json.access_token;
}

export type MetaAdAccount = {
  id: string;
  name?: string | null;
};

export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${META_GRAPH_API}/me/adaccounts`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "id,name");

  const res = await fetchWithTimeout(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta ad accounts fetch failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: MetaAdAccount[] };
  return json.data ?? [];
}

export type MetaInsight = {
  date: string; // ISO date string for the day (date_start)
  spend: number;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
};

/**
 * Fetches daily spend for an ad account within the given date range.
 * Uses time_increment=1 to return 1 row per day.
 */
export async function fetchMetaDailySpend(
  adAccountId: string,
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<MetaInsight[]> {
  const url = new URL(`${META_GRAPH_API}/${encodeURIComponent(adAccountId)}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("fields", "spend,campaign_id,adset_id,ad_id,date_start,date_stop");
  url.searchParams.set(
    "time_range",
    JSON.stringify({
      since: startDate.toISOString().slice(0, 10),
      until: endDate.toISOString().slice(0, 10),
    }),
  );

  const res = await fetchWithTimeout(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta insights fetch failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: Record<string, string>[] };
  const rows = json.data ?? [];

  return rows.map((row) => ({
    date: row.date_start,
    spend: Number(row.spend ?? 0),
    campaignId: row.campaign_id ?? null,
    adsetId: row.adset_id ?? null,
    adId: row.ad_id ?? null,
  }));
}

export type MetaCampaign = {
  id: string;
  name?: string | null;
  objective?: string | null;
};

/**
  * Fetch campaign metadata (id, name) for an ad account.
  * Paginates through all campaigns.
  */
export async function fetchMetaCampaigns(
  adAccountId: string,
  accessToken: string,
  options: FetchOptions = {},
): Promise<MetaCampaign[]> {
  const results: MetaCampaign[] = [];
  let nextUrl: string | null = `${META_GRAPH_API}/${encodeURIComponent(
    adAccountId,
  )}/campaigns?fields=id,name,objective&access_token=${encodeURIComponent(accessToken)}&limit=200`;
  let pageCount = 0;

  while (nextUrl) {
    const res = await fetchWithTimeout(nextUrl, { method: "GET" }, options.timeoutMs);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta campaigns fetch failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as {
      data?: MetaCampaign[];
      paging?: { next?: string };
    };
    if (json.data?.length) {
      results.push(...json.data);
    }
    nextUrl = json.paging?.next ?? null;
    pageCount += 1;
    if (options.maxPages && pageCount >= options.maxPages) {
      break;
    }
  }

  return results;
}
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = META_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}
