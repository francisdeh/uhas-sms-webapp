import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { AdminAttendancePicker } from "@/features/attendance/components/AdminAttendancePicker";

export default async function AdminAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const classes = await listClassesAction();

  return <AdminAttendancePicker classes={classes} />;
}
