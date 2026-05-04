import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

// Canonical site origin used to absolutize relative URLs in
// metadata (OpenGraph images, twitter cards). Override in preview
// deployments via `NEXT_PUBLIC_SITE_URL`.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://achordion.xyz";

const SITE_DESCRIPTION =
  "The independent music community and data layer. An open-source front-end for ListenBrainz with one-click playback through Parachord.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Achordion",
    template: "%s · Achordion",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Achordion",
  keywords: [
    "ListenBrainz",
    "MusicBrainz",
    "music",
    "scrobbling",
    "music discovery",
    "open source",
    "Parachord",
  ],
  authors: [{ name: "J Herskowitz", url: "https://github.com/jherskowitz" }],
  creator: "J Herskowitz",
  publisher: "J Herskowitz",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Achordion",
    title: "Achordion",
    description: SITE_DESCRIPTION,
    locale: "en_US",
    // The OG image is generated at request time by
    // `app/opengraph-image.tsx`; Next auto-injects it into the
    // openGraph.images list when this metadata is rendered.
  },
  twitter: {
    card: "summary_large_image",
    title: "Achordion",
    description: SITE_DESCRIPTION,
    creator: "@jherskowitz",
  },
  robots: {
    // Page-level <meta name="robots"> hint. The actual crawler
    // policy is enforced by `app/robots.ts` + `middleware.ts`
    // (UA / ASN blocking).
    index: true,
    follow: true,
  },
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
        {/* Vercel Speed Insights — measures real user performance
            metrics (Web Vitals). Edge-injected script only when
            deployed on Vercel; no-op locally and in self-hosted
            forks. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
