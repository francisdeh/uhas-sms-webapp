import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  students,
  classes,
  subjects,
  classSubjects,
  exams,
  scores,
  enrollments,
  attendanceSessions,
  attendanceRecords,
  studentReportRemarks,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getClassTeachersFor } from "@/features/classes/queries/get-class-by-id";
import { computeAggregate } from "@/features/exams/utils";
import type { Exam, Score } from "@/features/exams/types";
import type { Student } from "@/features/students/types";
import type { Division } from "@/features/auth/types";

export type ReportCardSubjectRow = {
  subjectId: string;
  subjectName: string;
  category: "Core" | "Elective";
  cat1: number | null;
  cat2: number | null;
  projectWork: number | null;
  groupWork: number | null;
  examScore: number | null;
  totalScore: number | null;
  grade: string | null;
  interpretation: string | null;
  subjectPosition: number | null;
};

export type ReportCardData = {
  exam: Exam;
  student: Student;
  className: string;
  numberOnRoll: number;
  coreRows: ReportCardSubjectRow[];
  electiveRows: ReportCardSubjectRow[];
  aggregate: number | null;
  attendance: { attended: number; total: number };
  classTeacherNames: string[];
  classTeacherRemark: string | null;
  headOfSchoolComment: string | null;
};

export async function getReportCardData(
  studentId: string,
  examId: string
): Promise<ReportCardData | null> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const [studentRow, examRow] = await Promise.all([
    db.query.students.findFirst({
      where: and(eq(students.id, studentId), eq(students.schoolId, schoolId)),
    }),
    db.query.exams.findFirst({
      where: and(eq(exams.id, examId), eq(exams.schoolId, schoolId)),
    }),
  ]);
  if (!studentRow || !examRow) return null;

  // Resolve student's class via the active enrollment for the exam's year.
  const enrollmentRow = await db
    .select({ classId: classes.id, className: classes.name, division: classes.division })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.academicYear, examRow.academicYear),
        eq(enrollments.status, "Active")
      )
    )
    .limit(1);
  if (enrollmentRow.length === 0) return null;
  const { classId, className, division } = enrollmentRow[0];

  // Class roster (active students in the class for the exam's year).
  const rosterRows = await db
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.classId, classId),
        eq(enrollments.academicYear, examRow.academicYear),
        eq(enrollments.status, "Active"),
        eq(students.isActive, true)
      )
    );
  const numberOnRoll = rosterRows.length;

  // Subjects: class_subjects ∪ (subjects in division).
  const classSubjectRows = await db
    .select({ subjectId: classSubjects.subjectId })
    .from(classSubjects)
    .where(eq(classSubjects.classId, classId));
  const classSubjectIds = new Set(classSubjectRows.map((r) => r.subjectId));

  const divisionSubjects = await db.query.subjects.findMany({
    where: and(eq(subjects.schoolId, schoolId), eq(subjects.division, division)),
  });
  const allSubjects = divisionSubjects.filter(
    (s) => classSubjectIds.has(s.id) || s.division === division
  );

  // Scores for this student in this exam.
  const scoreRows = await db.query.scores.findMany({
    where: and(eq(scores.examId, examId), eq(scores.studentId, studentId)),
  });
  const scoreBySubject = new Map(scoreRows.map((s) => [s.subjectId, s]));

  const buildRow = (
    subjectId: string,
    subjectName: string,
    category: "Core" | "Elective"
  ): ReportCardSubjectRow => {
    const score = scoreBySubject.get(subjectId);
    return {
      subjectId,
      subjectName,
      category,
      cat1: score?.cat1 ?? null,
      cat2: score?.cat2 ?? null,
      projectWork: score?.projectWork ?? null,
      groupWork: score?.groupWork ?? null,
      examScore: score?.examScore ?? null,
      totalScore: score?.totalScore ?? null,
      grade: score?.grade ?? null,
      interpretation: score?.interpretation ?? null,
      subjectPosition: score?.subjectPosition ?? null,
    };
  };

  const coreRows = allSubjects
    .filter((s) => s.category === "Core")
    .map((s) => buildRow(s.id, s.name, "Core"))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const electiveRows = allSubjects
    .filter((s) => s.category === "Elective")
    .map((s) => buildRow(s.id, s.name, "Elective"))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const aggregate = computeAggregate(
    [...coreRows, ...electiveRows] as Pick<Score, "grade">[]
  );

  // Attendance for this student in this class.
  const attendanceRows = await db
    .select({ status: attendanceRecords.status })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceSessions.id, attendanceRecords.sessionId)
    )
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceSessions.classId, classId)
      )
    );
  const total = attendanceRows.length;
  const attended = attendanceRows.filter(
    (r) => r.status === "present" || r.status === "late"
  ).length;

  // Class teacher names for this class.
  const teachersMap = await getClassTeachersFor([classId]);
  const classTeacherNames = (teachersMap.get(classId) ?? []).map((t) => t.staffName);

  // Class report remarks.
  const remarkRow = await db.query.studentReportRemarks.findFirst({
    where: and(
      eq(studentReportRemarks.examId, examId),
      eq(studentReportRemarks.studentId, studentId)
    ),
  });

  const student: Student = {
    id: studentRow.id,
    schoolId: studentRow.schoolId,
    firstName: studentRow.firstName,
    middleName: studentRow.middleName ?? undefined,
    lastName: studentRow.lastName,
    dob: studentRow.dob ?? "",
    gender: (studentRow.gender as "Male" | "Female") ?? "Male",
    classId,
    className,
    division: division as Division,
    phone: studentRow.phone ?? undefined,
    address: studentRow.address ?? undefined,
    nationality: studentRow.nationality ?? undefined,
    religion: studentRow.religion ?? undefined,
    photoUrl: studentRow.photoUrl ?? undefined,
    isActive: studentRow.isActive ?? true,
    createdAt: studentRow.createdAt?.toISOString() ?? new Date().toISOString(),
  };

  const exam: Exam = {
    id: examRow.id,
    schoolId: examRow.schoolId,
    name: examRow.name,
    type: examRow.type as Exam["type"],
    term: examRow.term,
    academicYear: examRow.academicYear,
    isPublished: examRow.isPublished ?? false,
    publishedAt: examRow.publishedAt?.toISOString() ?? null,
    createdAt: examRow.createdAt?.toISOString() ?? new Date().toISOString(),
  };

  return {
    exam,
    student,
    className,
    numberOnRoll,
    coreRows,
    electiveRows,
    aggregate,
    attendance: { attended, total },
    classTeacherNames,
    classTeacherRemark: remarkRow?.classTeacherRemark ?? null,
    headOfSchoolComment: remarkRow?.headOfSchoolComment ?? null,
  };
}
