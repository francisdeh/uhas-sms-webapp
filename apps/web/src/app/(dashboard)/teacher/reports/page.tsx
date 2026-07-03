import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/browser";
import { TeacherReports } from "@/features/reports/components/TeacherReports";
import type { ClassStats } from "@/features/reports/types";

// Rendered per-request — depends on the caller's session; opts out of
// Next's static analysis (which would fail on the Supabase env-var
// check during `next build`).
export const dynamic = "force-dynamic";

export default async function TeacherReportsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();

  // Classes the teacher teaches a subject in, plus classes they class-teach.
  const [subjectRowsResp, allClassesPage] = await Promise.all([
    api.classSubjects.listByTeacher(user.linkedId),
    api.classes.list({ size: 500 }),
  ]);

  const classIds = new Set<string>(subjectRowsResp.rows.map((r) => r.classId));
  const teacherLookups = await Promise.all(
    allClassesPage.items.map(async (c) => ({
      classId: c.id,
      teachers: (await api.classes.teachers.list(c.id)).items,
    })),
  );
  for (const entry of teacherLookups) {
    if (entry.teachers.some((t) => t.staffId === user.linkedId)) {
      classIds.add(entry.classId);
    }
  }

  // A 404 on one class (e.g. archived mid-year) shouldn't blank the page —
  // drop the row and keep the rest. Any other error propagates.
  const results = await Promise.all(
    [...classIds].map(async (id) => {
      try {
        return (await api.reports.getClassStats(id)) as ClassStats;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    }),
  );
  const classes = results.filter(
    (c): c is NonNullable<typeof c> => !!c,
  );

  return <TeacherReports classes={classes} />;
}
