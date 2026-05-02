import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coverartarchive.org",
      },
      {
        protocol: "https",
        hostname: "archive.org",
      },
      {
        protocol: "https",
        hostname: "ia.media-imager.archive.org",
      },
      {
        protocol: "https",
        hostname: "musicbrainz.org",
      },
      {
        protocol: "https",
        hostname: "gravatar.com",
      },
    ],
  },
};

export default nextConfig;
