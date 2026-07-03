import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { ParentAppointmentsView } from "@/features/appointments/components/ParentAppointmentsView";
import type { Appointment } from "@/features/appointments/types";

export default async function ParentAppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const { items: childRows } = await api.guardians.children(user.linkedId);

  const childOptions = await Promise.all(
    childRows.map(async (c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      className: c.className ?? "",
      teachers: (await api.appointments.teachersForStudent(c.id)).items,
    }))
  );

  const appointments = (await api.appointments.list()).items as unknown as Appointment[];

  return (
    <ParentAppointmentsView
      guardianId={user.linkedId}
      childOptions={childOptions}
      appointments={appointments}
    />
  );
}
