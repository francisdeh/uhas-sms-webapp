import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  students,
  staff,
  classes,
  subjects,
  enrollments,
  lessonPlans,
  exams,
  scores,
  attendanceSessions,
  attendanceRecords,
  classSubjects,
  studentGuardians,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { DIVISIONS } from "@/features/auth/types";
import { computeAggregate } from "@/features/exams/utils";
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

async function divisionTotals(division: Division, year: string): Promise<DivisionTotals> {
  const schoolId = await getCurrentSchoolId();

  const divisionClasses = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.academicYear, year),
      eq(classes.division, division)
    ),
  });
  const classIds = divisionClasses.map((c) => c.id);

  let studentsInDivision: { id: string; gender: string | null }[] = [];
  if (classIds.length > 0) {
    studentsInDivision = await db
      .select({ id: students.id, gender: students.gender })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          inArray(enrollments.classId, classIds),
          eq(enrollments.academicYear, year),
          eq(enrollments.status, "Active"),
          eq(students.isActive, true)
        )
      );
  }

  const divisionStaff = await db.query.staff.findMany({
    where: and(
      eq(staff.schoolId, schoolId),
      eq(staff.division, division),
      eq(staff.isActive, true)
    ),
  });

  return {
    division,
    students: studentsInDivision.length,
    male: studentsInDivision.filter((s) => s.gender === "Male").length,
    female: studentsInDivision.filter((s) => s.gender === "Female").length,
    classes: divisionClasses.length,
    staff: divisionStaff.length,
  };
}

export async function getSchoolStats(): Promise<SchoolStats> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const [allStudents, allStaff, yearClasses, allSubjects, yearExams, allLessonPlans] =
    await Promise.all([
      db.query.students.findMany({ where: eq(students.schoolId, schoolId) }),
      db.query.staff.findMany({ where: eq(staff.schoolId, schoolId) }),
      db.query.classes.findMany({
        where: and(eq(classes.schoolId, schoolId), eq(classes.academicYear, year)),
      }),
      db.query.subjects.findMany({ where: eq(subjects.schoolId, schoolId) }),
      db.query.exams.findMany({
        where: and(eq(exams.schoolId, schoolId), eq(exams.academicYear, year)),
      }),
      db.query.lessonPlans.findMany({
        where: and(eq(lessonPlans.schoolId, schoolId), isNull(lessonPlans.deletedAt)),
      }),
    ]);

  const activeStudents = allStudents.filter((s) => s.isActive);
  const inactiveStudents = allStudents.filter((s) => !s.isActive);
  const activeStaff = allStaff.filter((s) => s.isActive);

  const yearClassIds = yearClasses.map((c) => c.id);
  const yearLessonPlans = yearClassIds.length === 0
    ? []
    : allLessonPlans.filter((p) => yearClassIds.includes(p.classId));

  const today = todayISO();
  const todaySessions = await db.query.attendanceSessions.findMany({
    where: and(eq(attendanceSessions.schoolId, schoolId), eq(attendanceSessions.date, today)),
  });

  const distinctGuardians = await db
    .selectDistinct({ guardianId: studentGuardians.guardianId })
    .from(studentGuardians);

  const divisionsList = await Promise.all(DIVISIONS.map((d) => divisionTotals(d, year)));

  return {
    totals: {
      students: allStudents.length,
      activeStudents: activeStudents.length,
      inactiveStudents: inactiveStudents.length,
      staff: allStaff.length,
      activeStaff: activeStaff.length,
      classes: yearClasses.length,
      subjects: allSubjects.length,
      parents: distinctGuardians.length,
    },
    gender: {
      male: activeStudents.filter((s) => s.gender === "Male").length,
      female: activeStudents.filter((s) => s.gender === "Female").length,
    },
    divisions: divisionsList,
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
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();
  const totals = await divisionTotals(division, year);

  const divisionClasses = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.academicYear, year),
      eq(classes.division, division)
    ),
  });
  const classIds = divisionClasses.map((c) => c.id);

  const dates = lastNDates(7);
  const attendanceLast7 = await Promise.all(
    dates.map(async (date) => {
      if (classIds.length === 0) return { date, present: 0, total: 0 };
      const records = await db
        .select({ status: attendanceRecords.status })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceSessions.id, attendanceRecords.sessionId)
        )
        .where(
          and(
            eq(attendanceSessions.date, date),
            inArray(attendanceSessions.classId, classIds)
          )
        );
      const present = records.filter((r) => r.status === "present" || r.status === "late").length;
      return { date, present, total: records.length };
    })
  );

  // Lesson plans per status, scoped to this division (via class lookup)
  const allLessonPlans = await db.query.lessonPlans.findMany({
    where: and(eq(lessonPlans.schoolId, schoolId), isNull(lessonPlans.deletedAt)),
  });
  const divisionLessonPlans = allLessonPlans.filter((p) => classIds.includes(p.classId));
  const lessonPlansCounts = {
    draft: divisionLessonPlans.filter((p) => p.status === "draft").length,
    submitted: divisionLessonPlans.filter((p) => p.status === "submitted").length,
    approved: divisionLessonPlans.filter(
      (p) => p.status === "approved" || p.status === "unit_head_approved"
    ).length,
    rejected: divisionLessonPlans.filter((p) => p.status === "rejected").length,
  };

  // Top classes by aggregate
  const publishedExams = await db.query.exams.findMany({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.academicYear, year),
      eq(exams.isPublished, true)
    ),
  });
  const publishedExamIds = publishedExams.map((e) => e.id);

  const topClasses = await Promise.all(
    divisionClasses.map(async (c) => {
      const classStudents = await db
        .select({ id: students.id })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(
          and(
            eq(enrollments.classId, c.id),
            eq(enrollments.academicYear, year),
            eq(enrollments.status, "Active"),
            eq(students.isActive, true)
          )
        );
      const studentIds = classStudents.map((s) => s.id);
      const aggregates: number[] = [];
      if (studentIds.length > 0 && publishedExamIds.length > 0) {
        const allScores = await db.query.scores.findMany({
          where: and(
            inArray(scores.studentId, studentIds),
            inArray(scores.examId, publishedExamIds)
          ),
        });
        for (const sid of studentIds) {
          const studentScores = allScores.filter((s) => s.studentId === sid);
          const agg = computeAggregate(studentScores);
          if (agg != null) aggregates.push(agg);
        }
      }
      const aggregateAvg = aggregates.length === 0
        ? null
        : aggregates.reduce((a, b) => a + b, 0) / aggregates.length;
      return { classId: c.id, className: c.name, aggregateAvg };
    })
  );

  topClasses.sort((a, b) => {
    if (a.aggregateAvg == null) return 1;
    if (b.aggregateAvg == null) return -1;
    return a.aggregateAvg - b.aggregateAvg;
  });

  return { ...totals, attendanceLast7, lessonPlans: lessonPlansCounts, topClasses };
}

export async function getClassStats(classId: string): Promise<ClassStats | null> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls) return null;

  const rosterRows = await db
    .select({ id: students.id })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.classId, classId),
        eq(enrollments.academicYear, year),
        eq(enrollments.status, "Active"),
        eq(students.isActive, true)
      )
    );
  const studentIds = rosterRows.map((s) => s.id);

  const dates = lastNDates(7);
  const attendanceLast7 = await Promise.all(
    dates.map(async (date) => {
      const records = await db
        .select({ status: attendanceRecords.status })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceSessions.id, attendanceRecords.sessionId)
        )
        .where(
          and(
            eq(attendanceSessions.date, date),
            eq(attendanceSessions.classId, classId)
          )
        );
      const present = records.filter((r) => r.status === "present" || r.status === "late").length;
      return { date, present, total: records.length };
    })
  );

  // Subject averages
  const publishedExams = await db.query.exams.findMany({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.academicYear, year),
      eq(exams.isPublished, true)
    ),
  });
  const publishedExamIds = publishedExams.map((e) => e.id);

  const subjectRows = await db
    .select({
      subjectId: classSubjects.subjectId,
      subjectName: subjects.name,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(eq(classSubjects.classId, classId));

  const subjectAverages = await Promise.all(
    subjectRows.map(async (s) => {
      if (studentIds.length === 0 || publishedExamIds.length === 0) {
        return { subjectId: s.subjectId, subjectName: s.subjectName, avg: 0, samples: 0 };
      }
      const sc = await db.query.scores.findMany({
        where: and(
          eq(scores.subjectId, s.subjectId),
          inArray(scores.studentId, studentIds),
          inArray(scores.examId, publishedExamIds)
        ),
      });
      const valid = sc.filter((r) => r.totalScore != null);
      const total = valid.reduce((acc, r) => acc + (r.totalScore ?? 0), 0);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        avg: valid.length > 0 ? Math.round(total / valid.length) : 0,
        samples: valid.length,
      };
    })
  );

  return {
    classId,
    className: cls.name,
    students: studentIds.length,
    attendanceLast7,
    subjectAverages,
  };
}
