import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";

/**
 * Placeholder Accountant dashboard.
 *
 * Phase 1 stands up the role + auth surface; the actual finance UI
 * (invoices, payments, statements) lands in Phase 5 of the migration
 * plan. Without this page, a seeded Accountant who logs in would 404
 * since the proxy redirects them here. The placeholder keeps the auth
 * loop closed end-to-end.
 */
export default async function AccountantPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Accountant — Welcome, {user.displayName}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your dashboard is on the roadmap. Finance features land in Phase 5 of
        the platform migration.
      </p>
      <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
        Nothing to show yet. Watch this space for invoices, receipts, and
        payment reports.
      </div>
    </div>
  );
}
