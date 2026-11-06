import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLang } from "@/lib/i18n";
import { BRAND } from "@/lib/brand";
import { getLogo } from "@/lib/branding";

// The logo uploaded in Settings is also used as the browser-tab icon and the
// "Add to Home Screen" icon. Until one is uploaded the browser shows its default.
export async function generateMetadata(): Promise<Metadata> {
  const logo = await getLogo();
  return {
    title: BRAND,
    description: "Rent tents, chairs, tables and decorations for your function.",
    ...(logo ? { icons: { icon: logo, shortcut: logo, apple: logo } } : {}),
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#047857" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
