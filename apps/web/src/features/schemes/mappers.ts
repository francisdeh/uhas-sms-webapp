import type { components } from "@/types/api";
import type { Scheme } from "./types";

export function toScheme(s: components["schemas"]["SchemeRead"]): Scheme {
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
    reviewedById: s.reviewedById ?? null,
    reviewedByName: s.reviewedByName ?? null,
    reviewedAt: s.reviewedAt ?? null,
    submittedAt: s.submittedAt ?? null,
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.updatedAt ?? new Date().toISOString(),
    comments: (s.comments ?? []).map((c) => ({
      id: c.id,
      authorId: c.authorId,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt ?? null,
    })),
    entries: (s.entries ?? []).map((e) => ({
      id: e.id,
      week: e.week,
      strand: e.strand ?? null,
      subStrand: e.subStrand ?? null,
      contentStandard: e.contentStandard ?? null,
      indicators: e.indicators ?? null,
      resources: e.resources ?? null,
      resourceFileUrls: e.resourceFileUrls ?? [],
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    })),
  };
}
