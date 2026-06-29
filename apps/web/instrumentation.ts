/**
 * Next.js server-side instrumentation.
 *
 * Initialises Sentry for both the Node.js server runtime and any Edge
 * routes. Runs once on cold start. Silent no-op when SENTRY_DSN is
 * unset, so this file is safe to commit before the Sentry project exists.
 *
 * Pattern recommended by @sentry/nextjs v10. Replaces the older
 * sentry.server.config.ts + sentry.edge.config.ts split.
 */

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Server-side transactions are cheaper than browser ones; pull
      // a higher fraction for the same observability cost.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
      // Don't ship default PII (cookies, IP, etc.).
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
      sendDefaultPii: false,
    });
  }
}
