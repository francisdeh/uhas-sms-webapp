import type { Exam } from "@/features/exams/types";

export const mockExams: Exam[] = [
  // ─── Current academic year (2025/2026) ─────────────────────────────────────
  {
    id: "exam-midterm-t1-2026",
    schoolId: "school-uhas-001",
    name: "Mid-Term 1",
    type: "MidTerm",
    term: 1,
    academicYear: "2025/2026",
    isPublished: true,
    publishedAt: "2026-03-08T12:00:00Z",
    createdAt: "2026-03-01T08:00:00Z",
  },
  {
    id: "exam-eot-t1-2026",
    schoolId: "school-uhas-001",
    name: "End of Term 1",
    type: "EndOfTerm",
    term: 1,
    academicYear: "2025/2026",
    isPublished: false,
    publishedAt: null,
    createdAt: "2026-04-15T08:00:00Z",
  },
  {
    id: "exam-midterm-t2-2026",
    schoolId: "school-uhas-001",
    name: "Mid-Term 2",
    type: "MidTerm",
    term: 2,
    academicYear: "2025/2026",
    isPublished: false,
    publishedAt: null,
    createdAt: "2026-05-10T08:00:00Z",
  },

  // ─── Archive: previous academic year (2024/2025) ───────────────────────────
  {
    id: "exam-midterm-t1-2025",
    schoolId: "school-uhas-001",
    name: "Mid-Term 1",
    type: "MidTerm",
    term: 1,
    academicYear: "2024/2025",
    isPublished: true,
    publishedAt: "2025-03-08T12:00:00Z",
    createdAt: "2025-03-01T08:00:00Z",
  },
  {
    id: "exam-eot-t3-2025",
    schoolId: "school-uhas-001",
    name: "End of Term 3 (Final)",
    type: "EndOfTerm",
    term: 3,
    academicYear: "2024/2025",
    isPublished: true,
    publishedAt: "2025-07-22T12:00:00Z",
    createdAt: "2025-07-10T08:00:00Z",
  },
];
