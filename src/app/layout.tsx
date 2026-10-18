import type { Metadata } from "next";
import { ThemeScript } from "@/live";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Shipment Tracking", template: "%s | Shipment Tracking" },
  description: "Consolidated shipment visibility prototype",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-surface text-sm text-ink antialiased tabular-nums">{children}</body>
    </html>
  );
}
