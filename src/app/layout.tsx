import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Coffee shops & cafes in Toronto`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
