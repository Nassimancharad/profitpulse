import { requireAppPageAuth } from "@/lib/auth";
import type { EmbeddedAppSearchParams } from "@/lib/embeddedAppContext";

export type AppPageSearchParams<T extends Record<string, string | undefined> = Record<string, never>> =
  EmbeddedAppSearchParams & T;

export type AppPageSearchParamInput<T extends Record<string, string | undefined> = Record<string, never>> =
  | Promise<AppPageSearchParams<T>>
  | AppPageSearchParams<T>
  | undefined;

export async function resolveAppPageAuth<T extends Record<string, string | undefined> = Record<string, never>>(
  searchParams?: AppPageSearchParamInput<T>,
) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const auth = await requireAppPageAuth({ searchParams: resolvedSearchParams });

  return {
    auth,
    searchParams: resolvedSearchParams,
  };
}
