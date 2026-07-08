import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { SchemesList } from "@/features/schemes/components/SchemesList";
import { toScheme } from "@/features/schemes/mappers";

export default async function TeacherSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const resp = await api.schemes.list({ teacherId: user.linkedId, size: 200 });
  const schemes = resp.items.map(toScheme);

  return <SchemesList schemes={schemes} baseHref="/teacher/schemes" />;
}
