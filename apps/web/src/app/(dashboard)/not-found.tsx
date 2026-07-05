import { NotFoundState } from "@/components/ui/not-found-state";

// Catches unmatched routes below /(dashboard)/ — renders inside the
// dashboard shell so the sidebar + header stay intact, matching how
// error.tsx handles thrown errors in this same route group.
export default function DashboardNotFound() {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <NotFoundState
        title="Page not found"
        description="That page doesn't exist in your dashboard, or you don't have access to it."
      />
    </div>
  );
}
