import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shipment Tracking",
  description: "Consolidated shipment visibility prototype",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="bg-white text-sm text-ink antialiased tabular-nums">{children}</body>
    </html>
  );
}
