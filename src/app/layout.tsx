import type { Metadata } from "next";
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
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
