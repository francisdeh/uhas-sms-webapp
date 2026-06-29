// Seeds the DB with the demo dataset originally living in src/lib/mock/.
// Run with: npm run db:seed (idempotent) | npm run db:seed:reset | npm run db:seed:prod
//
// Flags:
//   --reset       truncate all tables first (refused if NODE_ENV=production)
//   --idempotent  ON CONFLICT DO NOTHING — safe to re-run
//   --no-demo    inserts only schools + staff + users (production minimum)

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

import { mockSchool, mockSchoolTerms } from "./_seed-data/school";
import { mockStaff } from "./_seed-data/staff";
import { mockUsers } from "./_seed-data/users";
import { mockStudents } from "./_seed-data/students";
import { mockGuardianProfiles } from "./_seed-data/guardians";
import { mockStudentGuardians } from "./_seed-data/student-guardians";
import { mockSubjects } from "./_seed-data/subjects";
import { mockClasses } from "./_seed-data/classes";
import { mockClassSubjects } from "./_seed-data/class-subjects";
import { mockExams } from "./_seed-data/exams";
import { mockScores } from "./_seed-data/scores";
import {
  mockAttendanceSessions,
  mockAttendanceRecords,
} from "./_seed-data/attendance";
import {
  mockStaffSessions,
  mockStaffAttendanceRecords,
} from "./_seed-data/staff-attendance";
import { mockLeaveRequests } from "./_seed-data/leave-requests";
import { mockLessonPlans } from "./_seed-data/lesson-plans";
import { mockSchemes } from "./_seed-data/schemes";
import { mockAssignments } from "./_seed-data/assignments";
import { mockAnnouncements } from "./_seed-data/announcements";
import { mockCalendarEvents } from "./_seed-data/calendar-events";
import { mockAppointments } from "./_seed-data/appointments";

config({ path: ".env.local" });
config({ path: ".env" });

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const IDEMPOTENT = args.has("--idempotent");
const NO_DEMO = args.has("--no-demo");

if (RESET && process.env.NODE_ENV === "production") {
  console.error("Refusing to --reset in production.");
  process.exit(1);
}

const TABLES_IN_TRUNCATE_ORDER = [
  "audit_log",
  "promotion_decisions",
  "promotion_submissions",
  "promotion_seasons",
  "appointments",
  "calendar_events",
  "announcements",
  "assignments",
  "schemes",
  "lesson_plans",
  "leave_requests",
  "staff_attendance_records",
  "staff_attendance_sessions",
  "attendance_records",
  "attendance_sessions",
  "student_report_remarks",
  "class_report_submissions",
  "scores",
  "exams",
  "enrollments",
  "class_subjects",
  "class_teachers",
  "subjects",
  "classes",
  "student_guardians",
  "guardians",
  "students",
  "users",
  "staff",
  "school_terms",
  "schools",
];

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  console.log(`Seeding ${redact(url)}…`);
  console.log(`  --reset:       ${RESET}`);
  console.log(`  --idempotent:  ${IDEMPOTENT}`);
  console.log(`  --no-demo:     ${NO_DEMO}\n`);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  try {
    if (RESET) {
      console.log("Truncating tables…");
      for (const table of TABLES_IN_TRUNCATE_ORDER) {
        await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
      }
      console.log(`  ✓ Truncated ${TABLES_IN_TRUNCATE_ORDER.length} tables\n`);
    }

    await db.transaction(async (tx) => {
      // 1. School
      await insert(tx, schema.schools, [
        {
          id: mockSchool.id,
          name: mockSchool.name,
          academicYear: mockSchool.academicYear,
          currentTerm: mockSchool.currentTerm,
          gradingScale: mockSchool.gradingScale,
          isActive: mockSchool.isActive,
          motto: mockSchool.motto,
          address: mockSchool.address,
          phone: mockSchool.phone,
          email: mockSchool.email,
          principalName: mockSchool.principalName,
          logoUrl: mockSchool.logoUrl,
          gradingBands: mockSchool.gradingBands,
          scoreWeights: mockSchool.scoreWeights,
          passMark: mockSchool.passMark,
          emailFromName: mockSchool.emailFromName,
          emailReplyTo: mockSchool.emailReplyTo,
          notificationDefaults: mockSchool.notificationDefaults,
          sessionTimeoutMinutes: mockSchool.sessionTimeoutMinutes,
          passwordMinLength: mockSchool.passwordMinLength,
          forcePasswordChangeOnFirstLogin: mockSchool.forcePasswordChangeOnFirstLogin,
          defaultColorScheme: mockSchool.defaultColorScheme,
          sidebarAccentHex: mockSchool.sidebarAccentHex,
        },
      ]);

      // 1b. School terms (per academic year)
      await insert(
        tx,
        schema.schoolTerms,
        mockSchoolTerms.map((t) => ({
          id: `term-${t.academicYear.replace("/", "-")}-${t.term}`,
          schoolId: mockSchool.id,
          academicYear: t.academicYear,
          term: t.term,
          startDate: t.startDate,
          endDate: t.endDate,
        }))
      );

      // 2. Staff (always inserted — minimum for logins)
      await insert(
        tx,
        schema.staff,
        mockStaff.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          uhasId: s.uhasId,
          firstName: s.firstName,
          lastName: s.lastName,
          rank: s.rank,
          systemRole: s.systemRole,
          division: s.division,
          isUnitHead: s.isUnitHead,
          unitHeadOf: s.unitHeadOf,
          photoUrl: s.photoUrl,
          phone: s.phone,
          email: s.email,
          isActive: s.isActive,
          createdAt: new Date(s.createdAt),
        }))
      );

      // 3. Users (Firebase UID bridge)
      await insert(
        tx,
        schema.users,
        mockUsers.map((u) => ({
          id: u.uid,
          schoolId: "school-uhas-001",
          email: u.email,
          role: u.role,
          linkedId: u.linkedId,
          isActive: true,
          mustChangePassword: false,
        }))
      );

      if (NO_DEMO) {
        console.log("--no-demo: skipping demo data inserts.");
        return;
      }

      // 4. Students
      await insert(
        tx,
        schema.students,
        mockStudents.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          firstName: s.firstName,
          middleName: s.middleName ?? null,
          lastName: s.lastName,
          dob: s.dob,
          gender: s.gender,
          photoUrl: s.photoUrl ?? null,
          phone: s.phone ?? null,
          address: s.address ?? null,
          nationality: s.nationality ?? null,
          religion: s.religion ?? null,
          isActive: s.isActive,
          createdAt: new Date(s.createdAt),
        }))
      );

      // 5. Guardians (mock shape is Record<id, { id, name, relationship, phone, email }>)
      const guardianRows = Object.values(mockGuardianProfiles).map((g) => {
        const { firstName, lastName } = splitName(g.name);
        return {
          id: g.id,
          schoolId: "school-uhas-001",
          firstName,
          lastName,
          email: g.email ?? `${g.id}@placeholder.uhas`,
          phone: g.phone ?? null,
        };
      });
      await insert(tx, schema.guardians, guardianRows);

      // 6. student_guardians junction (mock shape: Record<guardianId, studentId[]>)
      const studentGuardianRows: (typeof schema.studentGuardians.$inferInsert)[] = [];
      for (const [guardianId, studentIds] of Object.entries(mockStudentGuardians)) {
        const relation =
          mockGuardianProfiles[guardianId]?.relationship ?? "Guardian";
        for (let i = 0; i < studentIds.length; i++) {
          studentGuardianRows.push({
            studentId: studentIds[i],
            guardianId,
            relation,
            isPrimary: i === 0,
          });
        }
      }
      await insert(tx, schema.studentGuardians, studentGuardianRows);

      // 7. Subjects
      await insert(
        tx,
        schema.subjects,
        mockSubjects.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          name: s.name,
          division: s.division,
          category: s.category,
        }))
      );

      // 8. Classes (drop classTeachers — junction below)
      await insert(
        tx,
        schema.classes,
        mockClasses.map((c) => ({
          id: c.id,
          schoolId: c.schoolId,
          name: c.name,
          division: c.division,
          academicYear: c.academicYear,
        }))
      );

      // 9. class_teachers junction (extracted from mockClasses[].classTeachers)
      const classTeacherRows: (typeof schema.classTeachers.$inferInsert)[] = [];
      for (const c of mockClasses) {
        for (const t of c.classTeachers) {
          classTeacherRows.push({
            classId: c.id,
            staffId: t.staffId,
            isPrimary: t.isPrimary,
          });
        }
      }
      await insert(tx, schema.classTeachers, classTeacherRows);

      // 10. class_subjects (drop teacherName/subjectName)
      await insert(
        tx,
        schema.classSubjects,
        mockClassSubjects.map((cs) => ({
          classId: cs.classId,
          subjectId: cs.subjectId,
          teacherId: cs.teacherId,
        }))
      );

      // 11. enrollments — derived: one row per student in their current class
      await insert(
        tx,
        schema.enrollments,
        mockStudents.map((s) => ({
          id: `enr-${s.id}-${mockSchool.academicYear.replace("/", "-")}`,
          studentId: s.id,
          classId: s.classId,
          academicYear: mockSchool.academicYear,
          status: s.isActive ? "Active" : "Completed",
          enrollmentDate: s.createdAt.slice(0, 10),
        }))
      );

      // 12. Exams
      await insert(
        tx,
        schema.exams,
        mockExams.map((e) => ({
          id: e.id,
          schoolId: e.schoolId,
          name: e.name,
          type: e.type,
          term: e.term,
          academicYear: e.academicYear,
          isPublished: e.isPublished,
          publishedAt: e.publishedAt ? new Date(e.publishedAt) : null,
          createdAt: new Date(e.createdAt),
        }))
      );

      // 13. Scores
      await insert(
        tx,
        schema.scores,
        mockScores.map((s) => ({
          id: s.id,
          examId: s.examId,
          studentId: s.studentId,
          subjectId: s.subjectId,
          cat1: s.cat1,
          cat2: s.cat2,
          projectWork: s.projectWork,
          groupWork: s.groupWork,
          examScore: s.examScore,
          totalScore: s.totalScore,
          grade: s.grade,
          interpretation: s.interpretation,
          subjectPosition: s.subjectPosition,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        }))
      );

      // 14. attendance_sessions + attendance_records (student)
      await insert(
        tx,
        schema.attendanceSessions,
        mockAttendanceSessions.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          classId: s.classId,
          date: s.date,
          term: s.term,
          submittedById: s.submittedById,
          submittedAt: new Date(s.submittedAt),
        }))
      );
      await insert(
        tx,
        schema.attendanceRecords,
        mockAttendanceRecords.map((r) => ({
          sessionId: r.sessionId,
          studentId: r.studentId,
          status: r.status,
          lateReason: r.lateReason ?? null,
          note: r.note ?? null,
        }))
      );

      // 15. staff_attendance_sessions + staff_attendance_records
      await insert(
        tx,
        schema.staffAttendanceSessions,
        mockStaffSessions.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          division: s.division,
          date: s.date,
          term: s.term,
          submittedById: s.submittedById,
          submittedAt: new Date(s.submittedAt),
        }))
      );
      await insert(
        tx,
        schema.staffAttendanceRecords,
        mockStaffAttendanceRecords.map((r) => ({
          sessionId: r.sessionId,
          staffId: r.staffId,
          status: r.status,
          note: r.note ?? null,
        }))
      );

      // 16. leave_requests
      await insert(
        tx,
        schema.leaveRequests,
        mockLeaveRequests.map((l) => ({
          id: l.id,
          schoolId: l.schoolId,
          staffId: l.staffId,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason ?? null,
          status: l.status,
          approvedById: l.approvedById ?? null,
          createdAt: new Date(l.createdAt),
        }))
      );

      // 17. lesson_plans
      await insert(
        tx,
        schema.lessonPlans,
        mockLessonPlans.map((p) => ({
          id: p.id,
          schoolId: p.schoolId,
          teacherId: p.teacherId,
          subjectId: p.subjectId,
          classId: p.classId,
          term: p.term,
          week: p.week,
          topic: p.topic,
          learningObjectives: p.learningObjectives,
          teachingMethods: p.teachingMethods,
          resources: p.resources,
          assessmentPlan: p.assessmentPlan,
          fileUrl: p.fileUrl,
          status: p.status,
          reviewerComment: p.reviewerComment,
          reviewedById: p.reviewedById,
          reviewedAt: p.reviewedAt ? new Date(p.reviewedAt) : null,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }))
      );

      // 18. schemes
      await insert(
        tx,
        schema.schemes,
        mockSchemes.map((s) => ({
          id: s.id,
          schoolId: s.schoolId,
          teacherId: s.teacherId,
          subjectId: s.subjectId,
          classId: s.classId,
          type: s.type,
          term: s.term,
          academicYear: s.academicYear,
          title: s.title,
          fileUrl: s.fileUrl,
          content: s.content,
          status: s.status,
          reviewerComment: s.reviewerComment,
          reviewedById: s.reviewedById,
          reviewedAt: s.reviewedAt ? new Date(s.reviewedAt) : null,
          submittedAt: s.submittedAt ? new Date(s.submittedAt) : null,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        }))
      );

      // 19. assignments
      await insert(
        tx,
        schema.assignments,
        mockAssignments.map((a) => ({
          id: a.id,
          schoolId: a.schoolId,
          teacherId: a.teacherId,
          subjectId: a.subjectId,
          classId: a.classId,
          title: a.title,
          description: a.description,
          fileUrl: a.fileUrl,
          dueDate: a.dueDate,
          status: a.status,
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        }))
      );

      // 20. announcements
      await insert(
        tx,
        schema.announcements,
        mockAnnouncements.map((a) => ({
          id: a.id,
          schoolId: a.schoolId,
          title: a.title,
          body: a.body,
          audience: a.audience,
          isCritical: a.isCritical,
          createdById: a.createdById,
          createdAt: new Date(a.createdAt),
        }))
      );

      // 21. calendar_events
      await insert(
        tx,
        schema.calendarEvents,
        mockCalendarEvents.map((e) => ({
          id: e.id,
          schoolId: e.schoolId,
          title: e.title,
          description: e.description,
          startDate: e.startDate,
          endDate: e.endDate,
          type: e.type,
          createdById: e.createdById,
          createdAt: new Date(e.createdAt),
        }))
      );

      // 22. appointments
      await insert(
        tx,
        schema.appointments,
        mockAppointments.map((a) => ({
          id: a.id,
          schoolId: a.schoolId,
          guardianId: a.guardianId,
          studentId: a.studentId,
          teacherId: a.teacherId,
          preferredDate: a.preferredDate,
          preferredSlot: a.preferredSlot,
          reason: a.reason,
          status: a.status,
          teacherResponse: a.teacherResponse,
          respondedAt: a.respondedAt ? new Date(a.respondedAt) : null,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        }))
      );

      // 23. promotion_seasons, _submissions, _decisions — all empty in mock
    });

    console.log("\n✓ Seed complete");
  } finally {
    await pool.end();
  }
}

// Bulk insert helper. Honours --idempotent by appending ON CONFLICT DO NOTHING.
async function insert<T extends { $inferInsert: Record<string, unknown> }>(
  tx: { insert: (table: T) => { values: (rows: T["$inferInsert"][]) => { onConflictDoNothing: () => Promise<unknown> } & Promise<unknown> } },
  table: T,
  rows: T["$inferInsert"][]
) {
  if (rows.length === 0) return;
  const stmt = tx.insert(table).values(rows);
  if (IDEMPOTENT) {
    await stmt.onConflictDoNothing();
  } else {
    await stmt;
  }
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
