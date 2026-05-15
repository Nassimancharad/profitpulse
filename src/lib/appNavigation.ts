import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  applyEmbeddedAppContextToSearchParams,
  type EmbeddedAppContext,
} from "@/lib/embeddedAppContext";

export type AppNavItem = {
  href: string;
  label: string;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/costs", label: "Costs" },
  { href: "/connections", label: "Connections" },
  { href: "/preferences", label: "Preferences" },
  { href: "/settings", label: "Settings" },
];

export function resolveActiveAppHref(pathname: string | null): string | null {
  if (!pathname || pathname === "/") return null;
  const match = APP_NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.href ?? null;
}

export function buildEmbeddedAppHref(
  href: string,
  searchParams: URLSearchParams | ReadonlyURLSearchParams | null,
  embeddedContext: EmbeddedAppContext,
) {
  const params = new URLSearchParams();
  const shop = searchParams?.get("shop");

  if (shop) params.set("shop", shop);
  applyEmbeddedAppContextToSearchParams(params, embeddedContext);

  const query = params.toString();
  return query ? `${href}?${query}` : href;
}
