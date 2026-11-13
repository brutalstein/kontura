import type { Metadata, Viewport } from "next";
import { Archivo, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin", "latin-ext"], display: "swap" });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], display: "swap" });
const jb = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Kontura | DXF'ten dakikalar içinde lazer kesim teklifi", template: "%s | Kontura" },
  description: "Fason lazer ve plazma kesim atölyeleri için teklif yazılımı. DXF yükleyin; kesim boyu, delme sayısı, yerleşim ve maliyet otomatik hesaplansın.",
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f3f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#0c1116" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="tr" data-theme={theme === "light" || theme === "dark" ? theme : undefined} className={`${archivo.variable} ${barlow.variable} ${jb.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">İçeriğe geç</a>
        {children}
      </body>
    </html>
  );
}
