/**
 * Next.js client-side (browser) instrumentation.
 *
 * Initialises Sentry's browser bundle. Silent no-op when
 * NEXT_PUBLIC_SENTRY_DSN is unset. Replaces the older
 * sentry.client.config.ts (deprecated in @sentry/nextjs v10).
 */

import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // Lower than the server because every page view = a transaction;
    // 20% is plenty of signal at school-scale traffic.
    tracesSampleRate: 0.2,

    // Session replay — disabled by default. Enable only after talking
    // to the school about privacy implications (records keystrokes,
    // form values, and click events; needs explicit policy).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Don't auto-attach default PII; we'd rather opt-in per surface.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
