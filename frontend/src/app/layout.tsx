import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { QueryProvider } from "@/components/layout/QueryProvider";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IT Inventory — Учёт основных средств",
  description: "Корпоративная система инвентаризации основных средств",
};

/**
 * Масштабирование НЕ запрещаем (ни maximumScale, ни userScalable): на складе
 * человеку бывает нужно приблизить стёртый серийный номер, а запрет — это
 * ухудшение доступности, которое Android Chrome к тому же игнорирует.
 * viewportFit: cover — под экраны с вырезами у части защищённых терминалов.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
