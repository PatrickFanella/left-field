import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Share-card and icon URLs resolve against the public address.
const siteUrl = "https://left-field.subcult.tv";

export const viewport: Viewport = { themeColor: "#f4f0e6" };
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Left Field", template: "%s | Left Field" },
  openGraph: { siteName: "Left Field", type: "website" },
  twitter: { card: "summary_large_image" },
  description: "Ranked research briefs for Congress, governorships, and state legislatures, with the source record behind each score.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
