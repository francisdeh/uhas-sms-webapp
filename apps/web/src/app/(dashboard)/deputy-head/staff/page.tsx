import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import StaffTable from "@/features/staff/components/StaffTable";

export default async function DeputyHeadStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  const api = await getApi();
  const initialData = await api.staff.list({ size: 500 });

  return (
    <StaffTable
      initialData={initialData}
      division={division}
      listHref="/deputy-head/staff"
      readOnly
    />
  );
}
