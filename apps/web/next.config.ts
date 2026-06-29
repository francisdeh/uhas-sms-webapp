import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next/Image refuses external sources unless they're whitelisted.
    // Firebase Storage URLs come back as either firebasestorage.googleapis.com
    // (public + getDownloadURL form) or storage.googleapis.com (v4 signed URLs).
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/**" },
      { protocol: "https", hostname: "storage.googleapis.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
