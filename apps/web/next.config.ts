import { withSentryConfig } from "@sentry/nextjs";
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

// Sentry wrapper — applies webpack-level instrumentation + source-map upload.
// When SENTRY_AUTH_TOKEN is unset (local dev, PR builds), upload is silently
// skipped; the rest of the wrapper is still safe. Only set on Railway.
export default withSentryConfig(nextConfig, {
  // Sentry CLI auth — only needed for source-map upload at build time.
  // Set as SENTRY_AUTH_TOKEN on Railway after creating the Sentry project.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Org + project slug from Sentry. These are public; leave the
  // placeholders here and override via env in CI/Railway if you prefer.
  org: process.env.SENTRY_ORG ?? "uhas-sms",
  project: process.env.SENTRY_PROJECT ?? "uhas-sms-web",

  // Suppress the Sentry CLI's verbose logging in CI/Railway — it's
  // useful in local debug only.
  silent: !process.env.CI,

  sourcemaps: {
    // Delete client-side source maps from .next/static after upload so
    // they don't ship to browsers. Sentry still has them server-side
    // to symbolicate stack traces.
    deleteSourcemapsAfterUpload: true,
  },

  // Tunnels client-side Sentry requests through this Next.js route so
  // ad-blockers and corporate firewalls don't drop them. Disabled
  // until the route handler exists.
  // tunnelRoute: "/monitoring/sentry",
});
