import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockStudents } from "@/lib/mock/students";
import {
  listAppointmentsForGuardianAction,
  listTeachersForStudentAction,
} from "@/features/appointments/actions";
import { ParentAppointmentsView } from "@/features/appointments/components/ParentAppointmentsView";

export default async function ParentAppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const childIds = mockStudentGuardians[user.linkedId] ?? [];
  const childRecords = childIds
    .map((id) => mockStudents.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const childOptions = await Promise.all(
    childRecords.map(async (c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      className: c.className,
      teachers: await listTeachersForStudentAction(c.id),
    }))
  );

  const appointments = await listAppointmentsForGuardianAction(user.linkedId);

  return (
    <ParentAppointmentsView
      guardianId={user.linkedId}
      childOptions={childOptions}
      appointments={appointments}
    />
  );
}
