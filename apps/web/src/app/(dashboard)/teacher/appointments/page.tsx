import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAppointmentsForTeacherAction } from "@/features/appointments/actions";
import { TeacherAppointmentsInbox } from "@/features/appointments/components/TeacherAppointmentsInbox";

export default async function TeacherAppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const appointments = await listAppointmentsForTeacherAction(user.linkedId);

  return (
    <TeacherAppointmentsInbox teacherId={user.linkedId} appointments={appointments} />
  );
}
