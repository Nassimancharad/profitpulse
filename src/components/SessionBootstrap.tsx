"use client";

import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";
import { useEffect } from "react";

export function SessionBootstrap() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
    if (!apiKey) {
      return;
    }

    const host = new URLSearchParams(window.location.search).get("host");
    if (!host) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const app = createApp({
          apiKey,
          host,
          forceRedirect: true,
        });
        const token = await getSessionToken(app);
        if (!token || cancelled) {
          return;
        }

        await fetch("/api/auth/session", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            accept: "application/json",
          },
          cache: "no-store",
        });
      } catch {
        // Ignore bootstrap failures in non-embedded/dev contexts.
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
