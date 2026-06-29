"use client";

import { ErrorState } from "@/components/ui/error-state";

// Catches errors thrown by any Server Component below /(dashboard)/.
// Renders inside the dashboard shell so the sidebar + header stay intact
// while the page contents are replaced by the error UI.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <ErrorState error={error} reset={reset} />
    </div>
  );
}
