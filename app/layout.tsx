import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Achordion",
    template: "%s · Achordion",
  },
  description:
    "A modern alternative front-end for ListenBrainz. Browse listens, stats, charts, and recommendations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Providers>{children}</Providers>
        {/* Vercel Web Analytics — privacy-focused (no cookies, no
            individual tracking, IP-derived geo discarded after
            aggregation). Edge-injected script only when deployed
            on Vercel; no-op locally and in self-hosted forks. */}
        <Analytics />
      </body>
    </html>
  );
}
