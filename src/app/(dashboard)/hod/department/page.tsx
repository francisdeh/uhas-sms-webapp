import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getHodSubject } from "@/features/classes/queries/get-hod-subject";
import {
  listClassesAction,
  listClassSubjectsBySubjectAction,
} from "@/features/classes/actions";
import { getStaffById } from "@/features/staff/queries/get-staff-by-id";
import { DepartmentView } from "@/features/classes/components/DepartmentView";

export default async function HodDepartmentPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [hod, subject] = await Promise.all([
    getStaffById(user.linkedId),
    getHodSubject(user.linkedId),
  ]);

  if (!subject) notFound();

  const [jhsClasses, assignments] = await Promise.all([
    listClassesAction("JHS"),
    listClassSubjectsBySubjectAction(subject.id),
  ]);

  const assignmentMap = new Map(assignments.map((a) => [a.classId, a]));

  const rows = jhsClasses.map((schoolClass) => ({
    schoolClass,
    assignment: assignmentMap.get(schoolClass.id) ?? null,
  }));

  const hodName = hod ? `${hod.firstName} ${hod.lastName}` : "—";

  return (
    <DepartmentView subject={subject} hodName={hodName} rows={rows} />
  );
}
