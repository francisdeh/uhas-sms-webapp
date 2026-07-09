import type { Division } from "@/features/auth/types";

export type DivisionTotals = {
  division: Division;
  students: number;
  male: number;
  female: number;
  classes: number;
  staff: number;
};

export type GenderBreakdown = { male: number; female: number };

export type SchoolStats = {
  totals: {
    students: number;
    activeStudents: number;
    inactiveStudents: number;
    staff: number;
    activeStaff: number;
    classes: number;
    subjects: number;
    parents: number;
  };
  gender: GenderBreakdown;
  divisions: DivisionTotals[];
  lessonPlans: {
    draft: number;
    submitted: number;
    unitHeadApproved: number;
    approved: number;
    rejected: number;
  };
  exams: { total: number; published: number };
  todayAttendance: { sessionsRecorded: number; classes: number };
};

export type DivisionStats = DivisionTotals & {
  attendanceLast7: { date: string; present: number; total: number }[];
  lessonPlans: { draft: number; submitted: number; approved: number; rejected: number };
  topClasses: { classId: string; className: string; aggregateAvg: number | null }[];
};

export type ClassStats = {
  classId: string;
  className: string;
  students: number;
  attendanceLast7: { date: string; present: number; total: number }[];
  subjectAverages: { subjectId: string; subjectName: string; avg: number; samples: number }[];
};

export type CalendarEventType = "term_start" | "term_end" | "exam" | "holiday" | "event";

export type CalendarEvent = {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  type: CalendarEventType;
  createdById: string;
  createdAt: string;
  /** True for term-boundary entries synthesized from `school_terms` —
   *  not a real `calendar_events` row, so it can't be deleted. */
  isSynthetic?: boolean;
};

export type CreateCalendarEventInput = {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  type: CalendarEventType;
};

export type PscClassRow = {
  classId: string;
  className: string;
  division: Division;
  boys: number;
  girls: number;
  total: number;
};

export type PscDivisionStaff = {
  division: Division | "Cross";
  staff: { id: string; name: string; rank: string; isUnitHead: boolean }[];
};

export type PscReportData = {
  schoolName: string;
  asOf: string;
  totals: {
    students: number;
    boys: number;
    girls: number;
    leavers: number;
    teachers: number;
    admins: number;
  };
  classRows: PscClassRow[];
  staffByDivision: PscDivisionStaff[];
};
