"use client";

import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function SessionBootstrap() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const apiKey = document.body?.dataset?.shopifyApiKey;
    if (!apiKey) {
      return;
    }

    const host = searchParams.get("host");
    if (!host) {
      return;
    }
    const shop = searchParams.get("shop");
    const embedded = searchParams.get("embedded");

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const app = createApp({
          apiKey,
          host,
        });
        const token = await getSessionToken(app);
        if (!token || cancelled) {
          return;
        }

        const response = await fetch("/api/auth/session", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            accept: "application/json",
          },
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        if (pathname === "/connections") {
          const params = new URLSearchParams();
          if (shop) params.set("shop", shop);
          if (host) params.set("host", host);
          if (embedded) params.set("embedded", embedded);
          const query = params.toString();
          router.replace(query ? `/dashboard?${query}` : "/dashboard");
        }
      } catch (error) {
        // Avoid hard failures in mixed embedded/non-embedded contexts.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("Session bootstrap failed", error);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  return null;
}
