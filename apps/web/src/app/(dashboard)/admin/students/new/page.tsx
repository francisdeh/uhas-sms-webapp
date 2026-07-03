import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import StudentRegistrationForm from "@/features/students/components/StudentRegistrationForm";
import type { ClassRecord } from "@/features/students/types";

export default async function AdminNewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const resp = await api.classes.list({ size: 200 });
  const classes: ClassRecord[] = resp.items.map((c) => ({
    id: c.id,
    name: c.name,
    division: c.division,
  }));

  return (
    <div className="max-w-2xl mx-auto">
      <StudentRegistrationForm listHref="/admin/students" classes={classes} />
    </div>
  );
}
