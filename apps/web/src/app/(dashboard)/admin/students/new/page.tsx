import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/students/actions";
import StudentRegistrationForm from "@/features/students/components/StudentRegistrationForm";

export default async function AdminNewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const classes = await listClassesAction();

  return (
    <div className="max-w-2xl mx-auto">
      <StudentRegistrationForm listHref="/admin/students" classes={classes} />
    </div>
  );
}
