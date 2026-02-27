"use client";

import createApp from "@shopify/app-bridge";
import { AppLink, NavigationMenu } from "@shopify/app-bridge/actions";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

type ShopifyEmbeddedAppProps = {
  apiKey?: string;
};

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/costs", label: "Costs" },
  { href: "/connections", label: "Connections" },
  { href: "/preferences", label: "Preferences" },
  { href: "/settings", label: "Settings" },
];

function resolveActiveHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  return match?.href ?? null;
}

function withEmbedParams(href: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  const shop = searchParams.get("shop");
  const host = searchParams.get("host");
  const embedded = searchParams.get("embedded");

  if (shop) params.set("shop", shop);
  if (host) params.set("host", host);
  if (embedded) params.set("embedded", embedded);

  const query = params.toString();
  return query ? `${href}?${query}` : href;
}

export function ShopifyEmbeddedApp({ apiKey }: ShopifyEmbeddedAppProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeHref = useMemo(() => resolveActiveHref(pathname), [pathname]);
  const host = searchParams?.get("host") ?? "";

  useEffect(() => {
    if (!apiKey || !host) return;

    const app = createApp({
      apiKey,
      host,
      forceRedirect: true,
    });

    const currentParams = new URLSearchParams(searchParams?.toString() ?? "");
    const links = NAV_ITEMS.map((item) =>
      AppLink.create(app, {
        label: item.label,
        destination: withEmbedParams(item.href, currentParams),
      }),
    );

    const activeLink = activeHref
      ? links.find((_, index) => NAV_ITEMS[index]?.href === activeHref)
      : undefined;

    const navigationMenu = NavigationMenu.create(app, {
      items: links,
      active: activeLink,
    });

    return () => {
      navigationMenu.unsubscribe();
      links.forEach((link) => link.unsubscribe());
    };
  }, [activeHref, apiKey, host, searchParams]);

  return null;
}
