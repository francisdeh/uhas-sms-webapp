import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import StaffRegistrationForm from "@/features/staff/components/StaffRegistrationForm";

export default async function AdminNewStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <StaffRegistrationForm listHref="/admin/staff" />;
}
