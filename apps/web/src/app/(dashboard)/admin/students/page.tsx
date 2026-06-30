import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import StudentsTable from "@/features/students/components/StudentsTable";

export default async function AdminStudentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Prefetch from FastAPI so TanStack has initialData on first render.
  const api = await getApi();
  const initialData = await api.students.list({ size: 100 });

  return <StudentsTable initialData={initialData} listHref="/admin/students" />;
}
