import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AdminSchemeReview } from "@/features/schemes/components/AdminSchemeReview";
import type { Scheme } from "@/features/schemes/types";
import type { components } from "@/types/api";

function toScheme(s: components["schemas"]["SchemeRead"]): Scheme {
  return {
    id: s.id,
    schoolId: s.schoolId,
    teacherId: s.teacherId,
    teacherName: `${s.teacherFirstName} ${s.teacherLastName}`.trim(),
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    classId: s.classId,
    className: s.className,
    division: s.division,
    type: s.type,
    term: s.term,
    academicYear: s.academicYear,
    title: s.title,
    fileUrl: s.fileUrl ?? null,
    content: s.content ?? null,
    status: s.status,
    reviewerComment: s.reviewerComment ?? null,
    reviewedById: s.reviewedById ?? null,
    reviewedByName: s.reviewedByName ?? null,
    reviewedAt: s.reviewedAt ?? null,
    submittedAt: s.submittedAt ?? null,
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.updatedAt ?? new Date().toISOString(),
  };
}

export default async function AdminSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [pendingResp, acknowledgedResp] = await Promise.all([
    api.schemes.list({ status: "submitted", size: 100 }),
    api.schemes.list({ status: "acknowledged", size: 100 }),
  ]);
  const pending = pendingResp.items.map(toScheme);
  const acknowledged = acknowledgedResp.items.map(toScheme);

  return (
    <AdminSchemeReview
      reviewerId={user.linkedId}
      pending={pending}
      recent={acknowledged.slice(0, 10)}
    />
  );
}
