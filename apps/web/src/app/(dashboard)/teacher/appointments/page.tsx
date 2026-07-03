import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { TeacherAppointmentsInbox } from "@/features/appointments/components/TeacherAppointmentsInbox";
import type { Appointment } from "@/features/appointments/types";

export default async function TeacherAppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const appointments = (await api.appointments.list({ size: 200 }))
    .items as unknown as Appointment[];

  return (
    <TeacherAppointmentsInbox teacherId={user.linkedId} appointments={appointments} />
  );
}
