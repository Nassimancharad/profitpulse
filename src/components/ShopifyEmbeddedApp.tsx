"use client";

import createApp from "@shopify/app-bridge";
import { AppLink, NavigationMenu } from "@shopify/app-bridge/actions";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  applyEmbeddedAppContextToSearchParams,
  resolveEmbeddedAppContext,
} from "@/lib/embeddedAppContext";
import { APP_NAV_ITEMS, buildEmbeddedAppHref, resolveActiveAppHref } from "@/lib/appNavigation";

type ShopifyEmbeddedAppProps = {
  apiKey?: string;
};

export function ShopifyEmbeddedApp({ apiKey }: ShopifyEmbeddedAppProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeHref = useMemo(() => resolveActiveAppHref(pathname), [pathname]);
  const embeddedContext = useMemo(
    () =>
      resolveEmbeddedAppContext({
        searchParams,
        cookieHeader: typeof document !== "undefined" ? document.cookie : null,
      }),
    [searchParams],
  );
  const host = embeddedContext.host ?? "";

  useEffect(() => {
    if (!apiKey || !host) return;
    try {
      const app = createApp({
        apiKey,
        host,
        forceRedirect: true,
      });

      const currentParams = new URLSearchParams(searchParams?.toString() ?? "");
      applyEmbeddedAppContextToSearchParams(currentParams, embeddedContext);
      const links = APP_NAV_ITEMS.map((item) =>
        AppLink.create(app, {
          label: item.label,
          destination: buildEmbeddedAppHref(item.href, currentParams, embeddedContext),
        }),
      );

      const activeLink = activeHref
        ? links.find((_, index) => APP_NAV_ITEMS[index]?.href === activeHref)
        : undefined;

      const navigationMenu = NavigationMenu.create(app, {
        items: links,
        active: activeLink,
      });

      return () => {
        navigationMenu.unsubscribe();
        links.forEach((link) => link.unsubscribe());
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Embedded app bridge init failed", error);
      }
      return undefined;
    }
  }, [activeHref, apiKey, embeddedContext, host, searchParams]);

  return null;
}
