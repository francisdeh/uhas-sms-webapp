"use client";

import { ErrorState } from "@/components/ui/error-state";

// Root-level error boundary — catches errors from /(auth)/* and other
// non-dashboard routes. Dashboard routes are caught by the closer
// /(dashboard)/error.tsx boundary first.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <ErrorState
        error={error}
        reset={reset}
        homeHref="/login"
        homeLabel="Back to login"
        className="w-full max-w-md"
      />
    </div>
  );
}
