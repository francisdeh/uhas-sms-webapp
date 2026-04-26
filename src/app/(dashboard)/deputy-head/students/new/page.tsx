import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStaff } from "@/lib/mock/staff";
import { listClassesAction } from "@/features/students/actions";
import StudentRegistrationForm from "@/features/students/components/StudentRegistrationForm";

export default async function DeputyHeadNewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const staffMember = mockStaff.find((s) => s.id === user.linkedId);
  const division = (staffMember?.division ?? undefined) as
    | "KG"
    | "Primary"
    | "JHS"
    | undefined;

  const classes = await listClassesAction(division);

  return (
    <div className="max-w-2xl mx-auto">
      <StudentRegistrationForm
        division={division}
        listHref="/deputy-head/students"
        classes={classes}
      />
    </div>
  );
}
