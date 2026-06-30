import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { listClassesAction } from "@/features/classes/actions";
import StaffTable from "@/features/staff/components/StaffTable";

export default async function AdminStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Prefetch the first page from FastAPI — hands TanStack initialData so
  // the table renders without a client-side fetch on mount. The classes
  // list still goes through the legacy Drizzle action; Classes ports in
  // a later Phase-2 PR.
  const api = await getApi();
  const [initialData, classes] = await Promise.all([
    api.staff.list({ size: 100 }),
    listClassesAction(),
  ]);

  return <StaffTable initialData={initialData} classes={classes} listHref="/admin/staff" />;
}
