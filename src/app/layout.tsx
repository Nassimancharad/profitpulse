import type { Metadata } from "next";
import { ShopifyEmbeddedApp } from "@/components/ShopifyEmbeddedApp";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfitPulse",
  description: "ProfitPulse — profitability and ads analytics for Shopify merchants.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appBridgeApiKey = process.env.SHOPIFY_API_KEY;

  return (
    <html lang="en">
      <body className="antialiased">
        <Suspense fallback={null}>
          <ShopifyEmbeddedApp apiKey={appBridgeApiKey} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
