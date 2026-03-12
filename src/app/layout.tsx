import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfitPulse",
  description: "ProfitPulse — profitability and ads analytics for Shopify merchants.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
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
      <body
        className="antialiased"
        data-shopify-api-key={appBridgeApiKey ?? ""}
      >
        {children}
      </body>
    </html>
  );
}
