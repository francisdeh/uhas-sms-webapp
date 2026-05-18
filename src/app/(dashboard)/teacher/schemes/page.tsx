import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listSchemesForTeacherAction } from "@/features/schemes/actions";
import { SchemesList } from "@/features/schemes/components/SchemesList";

export default async function TeacherSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const schemes = await listSchemesForTeacherAction(user.linkedId);

  return <SchemesList schemes={schemes} baseHref="/teacher/schemes" />;
}
