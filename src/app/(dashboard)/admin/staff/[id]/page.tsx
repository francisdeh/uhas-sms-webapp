import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getStaffById } from "@/features/staff/queries/get-staff-by-id";
import StaffDetail from "@/features/staff/components/StaffDetail";

export default async function AdminStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const staff = await getStaffById(id);
  if (!staff) notFound();

  return <StaffDetail staff={staff} />;
}
