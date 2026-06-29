import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { listClassesAction } from "@/features/students/actions";
import StudentRegistrationForm from "@/features/students/components/StudentRegistrationForm";

export default async function DeputyHeadNewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);

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
