import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AdminAttendancePicker } from "@/features/attendance/components/AdminAttendancePicker";
import type { SchoolClass } from "@/features/classes/types";

export default async function AdminAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const classesResp = await api.classes.list({ size: 100 });
  const classes: SchoolClass[] = classesResp.items.map((c) => ({
    id: c.id,
    schoolId: c.schoolId,
    name: c.name,
    division: c.division,
    academicYear: c.academicYear,
    classTeachers: [],
  }));

  return <AdminAttendancePicker classes={classes} />;
}
