import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function TeacherExaminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Examinations"
      description="Enter class scores and exam scores for your students. The system calculates grades using the GES grading scale automatically."
    />
  );
}
