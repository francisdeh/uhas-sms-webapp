import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import StaffTable from "@/features/staff/components/StaffTable";
import type { SchoolClass } from "@/features/classes/types";

export default async function AdminStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Prefetch the first page from FastAPI — hands TanStack initialData so
  // the table renders without a client-side fetch on mount. Classes now
  // also go through the API for the class filter chips.
  const api = await getApi();
  const [initialData, classesResp] = await Promise.all([
    api.staff.list({ size: 100 }),
    api.classes.list({ size: 200 }),
  ]);
  const classes: SchoolClass[] = classesResp.items.map((c) => ({
    id: c.id,
    schoolId: c.schoolId,
    name: c.name,
    division: c.division,
    academicYear: c.academicYear,
    classTeachers: [],
  }));

  return <StaffTable initialData={initialData} classes={classes} listHref="/admin/staff" />;
}
