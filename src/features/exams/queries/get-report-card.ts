import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockClassSubjects } from "@/lib/mock/class-subjects";
import { mockExams } from "@/lib/mock/exams";
import { mockScores } from "@/lib/mock/scores";
import { mockStaff } from "@/lib/mock/staff";
import { mockAttendanceSessions, mockAttendanceRecords } from "@/lib/mock/attendance";
import { mockStudentRemarks } from "@/lib/mock/class-reports";
import { computeAggregate } from "@/features/exams/utils";
import type { Exam, Score } from "@/features/exams/types";
import type { Student } from "@/features/students/types";

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
  if (process.env.USE_MOCK_DATA !== "true") return null;

  const student = mockStudents.find((s) => s.id === studentId);
  if (!student) return null;

  const exam = mockExams.find((e) => e.id === examId);
  if (!exam) return null;

  const schoolClass = mockClasses.find((c) => c.id === student.classId);
  if (!schoolClass) return null;

  const classRoster = mockStudents.filter((s) => s.classId === student.classId && s.isActive);
  const numberOnRoll = classRoster.length;

  // Subjects the class actually takes (via class_subjects), plus any direct-division subjects
  const classSubjectIds = new Set(
    mockClassSubjects.filter((cs) => cs.classId === student.classId).map((cs) => cs.subjectId)
  );
  const classSubjects = mockSubjects.filter(
    (s) => classSubjectIds.has(s.id) || s.division === schoolClass.division
  );

  // Build subject rows. For each subject, look up the student's score (if any).
  const buildRow = (subjectId: string, subjectName: string, category: "Core" | "Elective"): ReportCardSubjectRow => {
    const score = mockScores.find(
      (sc) => sc.examId === examId && sc.subjectId === subjectId && sc.studentId === studentId
    );
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

  const coreRows = classSubjects
    .filter((s) => s.category === "Core")
    .map((s) => buildRow(s.id, s.name, "Core"))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const electiveRows = classSubjects
    .filter((s) => s.category === "Elective")
    .map((s) => buildRow(s.id, s.name, "Elective"))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const aggregate = computeAggregate([...coreRows, ...electiveRows] as Pick<Score, "grade">[]);

  // Attendance — count sessions for this class against present/late vs absent.
  const classSessions = mockAttendanceSessions.filter((sess) => sess.classId === student.classId);
  const sessionIds = new Set(classSessions.map((sess) => sess.id));
  const studentRecords = mockAttendanceRecords.filter(
    (r) => r.studentId === studentId && sessionIds.has(r.sessionId)
  );
  const attended = studentRecords.filter((r) => r.status === "present" || r.status === "late").length;
  const total = studentRecords.length;

  const classTeacherNames = schoolClass.classTeachers
    .map((t) => t.staffName)
    .filter((name): name is string => !!name);
  // Fall back to looking up via mockStaff if no name embedded (should not happen with fixtures)
  if (classTeacherNames.length === 0 && schoolClass.classTeachers.length > 0) {
    for (const t of schoolClass.classTeachers) {
      const s = mockStaff.find((st) => st.id === t.staffId);
      if (s) classTeacherNames.push(`${s.firstName} ${s.lastName}`);
    }
  }

  const remark = mockStudentRemarks.find(
    (r) => r.examId === examId && r.studentId === studentId
  );

  return {
    exam,
    student,
    className: schoolClass.name,
    numberOnRoll,
    coreRows,
    electiveRows,
    aggregate,
    attendance: { attended, total },
    classTeacherNames,
    classTeacherRemark: remark?.classTeacherRemark ?? null,
    headOfSchoolComment: remark?.headOfSchoolComment ?? null,
  };
}
