import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockLessonPlans } from "@/lib/mock/lesson-plans";
import { mockExams } from "@/lib/mock/exams";
import { mockScores } from "@/lib/mock/scores";
import { mockAttendanceSessions, mockAttendanceRecords } from "@/lib/mock/attendance";
import { mockClassSubjects } from "@/lib/mock/class-subjects";
import { computeAggregate } from "@/features/exams/utils";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { DIVISIONS } from "@/features/auth/types";
import type { Division } from "@/features/auth/types";
import type {
  SchoolStats,
  DivisionTotals,
  DivisionStats,
  ClassStats,
} from "@/features/reports/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function divisionTotals(division: Division): DivisionTotals {
  const students = mockStudents.filter((s) => s.division === division && s.isActive);
  const classes = mockClasses.filter((c) => c.division === division);
  const staff = mockStaff.filter((s) => s.division === division && s.isActive);
  return {
    division,
    students: students.length,
    male: students.filter((s) => s.gender === "Male").length,
    female: students.filter((s) => s.gender === "Female").length,
    classes: classes.length,
    staff: staff.length,
  };
}

export async function getSchoolStats(): Promise<SchoolStats> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return {
      totals: {
        students: 0,
        activeStudents: 0,
        inactiveStudents: 0,
        staff: 0,
        activeStaff: 0,
        classes: 0,
        subjects: 0,
        parents: 0,
      },
      gender: { male: 0, female: 0 },
      divisions: [],
      lessonPlans: { draft: 0, submitted: 0, unitHeadApproved: 0, approved: 0, rejected: 0 },
      exams: { total: 0, published: 0 },
      todayAttendance: { sessionsRecorded: 0, classes: 0 },
    };
  }

  const year = await getCurrentAcademicYear();
  const activeStudents = mockStudents.filter((s) => s.isActive);
  const inactiveStudents = mockStudents.filter((s) => !s.isActive);
  const activeStaff = mockStaff.filter((s) => s.isActive);
  const yearClasses = mockClasses.filter((c) => c.academicYear === year);
  const yearExams = mockExams.filter((e) => e.academicYear === year);
  const yearLessonPlans = mockLessonPlans.filter((p) => p.academicYear === year);
  const today = todayISO();
  const todaySessions = mockAttendanceSessions.filter((s) => s.date === today);

  return {
    totals: {
      students: mockStudents.length,
      activeStudents: activeStudents.length,
      inactiveStudents: inactiveStudents.length,
      staff: mockStaff.length,
      activeStaff: activeStaff.length,
      classes: yearClasses.length,
      subjects: mockSubjects.length,
      parents: Object.keys(mockStudentGuardians).length,
    },
    gender: {
      male: activeStudents.filter((s) => s.gender === "Male").length,
      female: activeStudents.filter((s) => s.gender === "Female").length,
    },
    divisions: DIVISIONS.map(divisionTotals),
    lessonPlans: {
      draft: yearLessonPlans.filter((p) => p.status === "draft").length,
      submitted: yearLessonPlans.filter((p) => p.status === "submitted").length,
      unitHeadApproved: yearLessonPlans.filter((p) => p.status === "unit_head_approved").length,
      approved: yearLessonPlans.filter((p) => p.status === "approved").length,
      rejected: yearLessonPlans.filter((p) => p.status === "rejected").length,
    },
    exams: {
      total: yearExams.length,
      published: yearExams.filter((e) => e.isPublished).length,
    },
    todayAttendance: {
      sessionsRecorded: todaySessions.length,
      classes: yearClasses.length,
    },
  };
}

export async function getDivisionStats(division: Division): Promise<DivisionStats> {
  const year = await getCurrentAcademicYear();
  const totals = divisionTotals(division);
  const divisionClasses = mockClasses.filter(
    (c) => c.division === division && c.academicYear === year
  );
  const classIds = new Set(divisionClasses.map((c) => c.id));

  // Attendance by date over last 7 days
  const dates = lastNDates(7);
  const attendanceLast7 = dates.map((date) => {
    const sessions = mockAttendanceSessions.filter(
      (s) => s.date === date && classIds.has(s.classId)
    );
    const sessionIds = new Set(sessions.map((s) => s.id));
    const records = mockAttendanceRecords.filter((r) => sessionIds.has(r.sessionId));
    const present = records.filter((r) => r.status === "present" || r.status === "late").length;
    return { date, present, total: records.length };
  });

  const planFilter = (p: { division: Division; academicYear: string }) =>
    p.division === division && p.academicYear === year;
  const lessonPlans = {
    draft: mockLessonPlans.filter((p) => p.status === "draft" && planFilter(p)).length,
    submitted: mockLessonPlans.filter((p) => p.status === "submitted" && planFilter(p)).length,
    approved: mockLessonPlans.filter(
      (p) => (p.status === "approved" || p.status === "unit_head_approved") && planFilter(p)
    ).length,
    rejected: mockLessonPlans.filter((p) => p.status === "rejected" && planFilter(p)).length,
  };

  // Top classes by average aggregate of their students (lower aggregate = better, BECE style)
  const publishedExamIds = new Set(
    mockExams.filter((e) => e.isPublished && e.academicYear === year).map((e) => e.id)
  );
  const topClasses = divisionClasses
    .map((c) => {
      const students = mockStudents.filter((s) => s.classId === c.id && s.isActive);
      const aggregates = students
        .map((s) => {
          const studentScores = mockScores.filter(
            (sc) => sc.studentId === s.id && publishedExamIds.has(sc.examId)
          );
          return computeAggregate(studentScores);
        })
        .filter((v): v is number => v != null);
      const aggregateAvg =
        aggregates.length === 0
          ? null
          : aggregates.reduce((a, b) => a + b, 0) / aggregates.length;
      return { classId: c.id, className: c.name, aggregateAvg };
    })
    .sort((a, b) => {
      if (a.aggregateAvg == null) return 1;
      if (b.aggregateAvg == null) return -1;
      return a.aggregateAvg - b.aggregateAvg;
    });

  return { ...totals, attendanceLast7, lessonPlans, topClasses };
}

export async function getClassStats(classId: string): Promise<ClassStats | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  const cls = mockClasses.find((c) => c.id === classId);
  if (!cls) return null;

  const students = mockStudents.filter((s) => s.classId === classId && s.isActive);
  const dates = lastNDates(7);
  const attendanceLast7 = dates.map((date) => {
    const sessions = mockAttendanceSessions.filter(
      (s) => s.date === date && s.classId === classId
    );
    const sessionIds = new Set(sessions.map((s) => s.id));
    const records = mockAttendanceRecords.filter((r) => sessionIds.has(r.sessionId));
    const present = records.filter((r) => r.status === "present" || r.status === "late").length;
    return { date, present, total: records.length };
  });

  // Subject averages — across published exams in the currently-selected year
  const year = await getCurrentAcademicYear();
  const publishedExamIds = new Set(
    mockExams.filter((e) => e.isPublished && e.academicYear === year).map((e) => e.id)
  );
  const classSubjects = mockClassSubjects.filter((cs) => cs.classId === classId);
  const subjectAverages = classSubjects.map((cs) => {
    const scoresForSubject = mockScores.filter(
      (sc) =>
        sc.subjectId === cs.subjectId &&
        publishedExamIds.has(sc.examId) &&
        students.some((st) => st.id === sc.studentId) &&
        sc.totalScore != null
    );
    const total = scoresForSubject.reduce((acc, sc) => acc + (sc.totalScore ?? 0), 0);
    return {
      subjectId: cs.subjectId,
      subjectName: cs.subjectName,
      avg: scoresForSubject.length > 0 ? Math.round(total / scoresForSubject.length) : 0,
      samples: scoresForSubject.length,
    };
  });

  return {
    classId,
    className: cls.name,
    students: students.length,
    attendanceLast7,
    subjectAverages,
  };
}
