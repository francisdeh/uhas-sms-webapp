import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi } from "@/lib/api/server";
import StudentRegistrationForm from "@/features/students/components/StudentRegistrationForm";
import type { ClassRecord } from "@/features/students/types";

export default async function DeputyHeadNewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);

  const api = await getApi();
  const classesPage = await api.classes.list({ division, size: 200 });
  const classes: ClassRecord[] = classesPage.items.map((c) => ({
    id: c.id,
    name: c.name,
    division: c.division,
  }));

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
