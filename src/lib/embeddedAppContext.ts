type ParamReader = {
  get: (name: string) => string | null;
};

export type EmbeddedAppSearchParams = {
  host?: string;
  embedded?: string;
};

export const EMBEDDED_APP_HOST_PARAM = "host";
export const EMBEDDED_APP_FLAG_PARAM = "embedded";

export const EMBEDDED_APP_HOST_COOKIE = "pp_embedded_host";
export const EMBEDDED_APP_FLAG_COOKIE = "pp_embedded";

export type EmbeddedAppContext = {
  host: string | null;
  embedded: string | null;
};

export function parseCookieValue(cookieHeader: string | null | undefined, key: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [cookieKey, ...rest] = part.trim().split("=");
    if (cookieKey === key) {
      const rawValue = rest.join("=");
      if (!rawValue) return null;
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return null;
}

export function getEmbeddedAppContextFromCookies(cookieHeader: string | null | undefined): EmbeddedAppContext {
  return {
    host: parseCookieValue(cookieHeader, EMBEDDED_APP_HOST_COOKIE),
    embedded: parseCookieValue(cookieHeader, EMBEDDED_APP_FLAG_COOKIE),
  };
}

export function getEmbeddedAppContextFromSearchParams(searchParams: ParamReader | null | undefined): EmbeddedAppContext {
  if (!searchParams) {
    return { host: null, embedded: null };
  }
  return {
    host: searchParams.get(EMBEDDED_APP_HOST_PARAM),
    embedded: searchParams.get(EMBEDDED_APP_FLAG_PARAM),
  };
}

export function resolveEmbeddedAppContext(input: {
  searchParams?: ParamReader | null;
  cookieHeader?: string | null;
}): EmbeddedAppContext {
  const fromSearch = getEmbeddedAppContextFromSearchParams(input.searchParams);
  const fromCookies = getEmbeddedAppContextFromCookies(input.cookieHeader);
  return {
    host: fromSearch.host ?? fromCookies.host,
    embedded: fromSearch.embedded ?? fromCookies.embedded,
  };
}

export function isEmbeddedAppContext(context: EmbeddedAppContext) {
  return context.embedded === "1" || Boolean(context.host);
}

export function resolveEmbeddedAppContextFromSearchParamsObject(
  searchParams?: EmbeddedAppSearchParams | null,
): EmbeddedAppContext {
  return {
    host: searchParams?.host ?? null,
    embedded: searchParams?.embedded ?? null,
  };
}

export function resolveCurrentEmbeddedAppContext(input: {
  searchParams?: EmbeddedAppSearchParams | null;
  cookieHeader?: string | null;
}) {
  const fromSearch = resolveEmbeddedAppContextFromSearchParamsObject(input.searchParams);
  const fromCookies = getEmbeddedAppContextFromCookies(input.cookieHeader);
  return {
    host: fromSearch.host ?? fromCookies.host,
    embedded: fromSearch.embedded ?? fromCookies.embedded,
  };
}

export function applyEmbeddedAppContextToSearchParams(
  params: URLSearchParams,
  context: EmbeddedAppContext,
) {
  if (context.host) {
    params.set(EMBEDDED_APP_HOST_PARAM, context.host);
  }
  if (context.embedded) {
    params.set(EMBEDDED_APP_FLAG_PARAM, context.embedded);
  }
}
