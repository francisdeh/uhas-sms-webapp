import { NotFoundState } from "@/components/ui/not-found-state";

// Root-level 404 — catches unmatched routes outside /(dashboard)/*.
// Dashboard routes get their own boundary so the sidebar + header stay
// intact; see (dashboard)/not-found.tsx.
export default function RootNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <NotFoundState className="w-full max-w-md" />
    </div>
  );
}
