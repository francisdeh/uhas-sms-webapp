import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listStaffAction } from "@/features/staff/actions";
import { listClassesAction } from "@/features/classes/actions";
import StaffTable from "@/features/staff/components/StaffTable";

export default async function AdminStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [staff, classes] = await Promise.all([
    listStaffAction(),
    listClassesAction(),
  ]);

  return <StaffTable initialStaff={staff} classes={classes} listHref="/admin/staff" />;
}
