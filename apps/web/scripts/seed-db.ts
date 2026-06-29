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

import { det } from "./_seed-data/_uuid";
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
      // Every semantic id from the fixtures runs through det() to derive
      // a deterministic UUID — same input always yields the same UUID
      // across runs, machines, CI. FK references in other fixtures use
      // the same det(key) call against the same key string.
      const SCHOOL_UUID = det(mockSchool.id);

      // 1. School — slug = "uhas-basic" (URL/audit-friendly), distinct from det() key
      await insert(tx, schema.schools, [
        {
          id: SCHOOL_UUID,
          slug: "uhas-basic",
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

      // 1b. School terms (per academic year) — id auto-generated by DB
      await insert(
        tx,
        schema.schoolTerms,
        mockSchoolTerms.map((t) => ({
          schoolId: SCHOOL_UUID,
          academicYear: t.academicYear,
          term: t.term,
          startDate: t.startDate,
          endDate: t.endDate,
        }))
      );

      // 2. Staff — slug preserves the human-readable "STAFF-001" id
      await insert(
        tx,
        schema.staff,
        mockStaff.map((s) => ({
          id: det(s.id),
          slug: s.id,
          schoolId: SCHOOL_UUID,
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

      // 3. Users (Supabase Auth bridge) — id is the Supabase user uuid
      // (already a uuid from PR #16's auth seed). linkedId points at the
      // staff / guardian row via det(slug).
      await insert(
        tx,
        schema.users,
        mockUsers.map((u) => ({
          id: u.uid,
          schoolId: SCHOOL_UUID,
          email: u.email,
          role: u.role,
          linkedId: det(u.linkedId),
          isActive: true,
          mustChangePassword: false,
        }))
      );

      if (NO_DEMO) {
        console.log("--no-demo: skipping demo data inserts.");
        return;
      }

      // 4. Students — slug = "UHAS-2026-0001" preserved as the official student id
      await insert(
        tx,
        schema.students,
        mockStudents.map((s) => ({
          id: det(s.id),
          slug: s.id,
          schoolId: SCHOOL_UUID,
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

      // 5. Guardians — slug preserves "guardian-001" etc.
      const guardianRows = Object.values(mockGuardianProfiles).map((g) => {
        const { firstName, lastName } = splitName(g.name);
        return {
          id: det(g.id),
          slug: g.id,
          schoolId: SCHOOL_UUID,
          firstName,
          lastName,
          email: g.email ?? `${g.id}@placeholder.uhas`,
          phone: g.phone ?? null,
        };
      });
      await insert(tx, schema.guardians, guardianRows);

      // 6. student_guardians junction
      const studentGuardianRows: (typeof schema.studentGuardians.$inferInsert)[] = [];
      for (const [guardianId, studentIds] of Object.entries(mockStudentGuardians)) {
        const relation =
          mockGuardianProfiles[guardianId]?.relationship ?? "Guardian";
        for (let i = 0; i < studentIds.length; i++) {
          studentGuardianRows.push({
            studentId: det(studentIds[i]),
            guardianId: det(guardianId),
            relation,
            isPrimary: i === 0,
          });
        }
      }
      await insert(tx, schema.studentGuardians, studentGuardianRows);

      // 7. Subjects — slug = "MATH" / "ENG" preserved as subject codes
      await insert(
        tx,
        schema.subjects,
        mockSubjects.map((s) => ({
          id: det(s.id),
          slug: s.id,
          schoolId: SCHOOL_UUID,
          name: s.name,
          division: s.division,
          category: s.category,
        }))
      );

      // 8. Classes — slug = "class-jhs1" preserved for URL routing
      await insert(
        tx,
        schema.classes,
        mockClasses.map((c) => ({
          id: det(c.id),
          slug: c.id,
          schoolId: SCHOOL_UUID,
          name: c.name,
          division: c.division,
          academicYear: c.academicYear,
        }))
      );

      // 9. class_teachers junction
      const classTeacherRows: (typeof schema.classTeachers.$inferInsert)[] = [];
      for (const c of mockClasses) {
        for (const t of c.classTeachers) {
          classTeacherRows.push({
            classId: det(c.id),
            staffId: det(t.staffId),
            isPrimary: t.isPrimary,
          });
        }
      }
      await insert(tx, schema.classTeachers, classTeacherRows);

      // 10. class_subjects
      await insert(
        tx,
        schema.classSubjects,
        mockClassSubjects.map((cs) => ({
          classId: det(cs.classId),
          subjectId: det(cs.subjectId),
          teacherId: cs.teacherId ? det(cs.teacherId) : null,
        }))
      );

      // 11. enrollments — id auto-generated by DB
      await insert(
        tx,
        schema.enrollments,
        mockStudents.map((s) => ({
          studentId: det(s.id),
          classId: det(s.classId),
          academicYear: mockSchool.academicYear,
          status: s.isActive ? "Active" : "Completed",
          enrollmentDate: s.createdAt.slice(0, 10),
        }))
      );

      // 12. Exams — id is the fixture's semantic id translated via det()
      await insert(
        tx,
        schema.exams,
        mockExams.map((e) => ({
          id: det(e.id),
          schoolId: SCHOOL_UUID,
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
          id: det(s.id),
          examId: det(s.examId),
          studentId: det(s.studentId),
          subjectId: det(s.subjectId),
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
          id: det(s.id),
          schoolId: SCHOOL_UUID,
          classId: det(s.classId),
          date: s.date,
          term: s.term,
          submittedById: s.submittedById ? det(s.submittedById) : null,
          submittedAt: new Date(s.submittedAt),
        }))
      );
      await insert(
        tx,
        schema.attendanceRecords,
        mockAttendanceRecords.map((r) => ({
          sessionId: det(r.sessionId),
          studentId: det(r.studentId),
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
          id: det(s.id),
          schoolId: SCHOOL_UUID,
          division: s.division,
          date: s.date,
          term: s.term,
          submittedById: s.submittedById ? det(s.submittedById) : null,
          submittedAt: new Date(s.submittedAt),
        }))
      );
      await insert(
        tx,
        schema.staffAttendanceRecords,
        mockStaffAttendanceRecords.map((r) => ({
          sessionId: det(r.sessionId),
          staffId: det(r.staffId),
          status: r.status,
          note: r.note ?? null,
        }))
      );

      // 16. leave_requests
      await insert(
        tx,
        schema.leaveRequests,
        mockLeaveRequests.map((l) => ({
          id: det(l.id),
          schoolId: SCHOOL_UUID,
          staffId: det(l.staffId),
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason ?? null,
          status: l.status,
          approvedById: l.approvedById ? det(l.approvedById) : null,
          createdAt: new Date(l.createdAt),
        }))
      );

      // 17. lesson_plans
      await insert(
        tx,
        schema.lessonPlans,
        mockLessonPlans.map((p) => ({
          id: det(p.id),
          schoolId: SCHOOL_UUID,
          teacherId: det(p.teacherId),
          subjectId: det(p.subjectId),
          classId: det(p.classId),
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
          reviewedById: p.reviewedById ? det(p.reviewedById) : null,
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
          id: det(s.id),
          schoolId: SCHOOL_UUID,
          teacherId: det(s.teacherId),
          subjectId: det(s.subjectId),
          classId: det(s.classId),
          type: s.type,
          term: s.term,
          academicYear: s.academicYear,
          title: s.title,
          fileUrl: s.fileUrl,
          content: s.content,
          status: s.status,
          reviewerComment: s.reviewerComment,
          reviewedById: s.reviewedById ? det(s.reviewedById) : null,
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
          id: det(a.id),
          schoolId: SCHOOL_UUID,
          teacherId: det(a.teacherId),
          subjectId: det(a.subjectId),
          classId: det(a.classId),
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
          id: det(a.id),
          schoolId: SCHOOL_UUID,
          title: a.title,
          body: a.body,
          audience: a.audience,
          isCritical: a.isCritical,
          createdById: det(a.createdById),
          createdAt: new Date(a.createdAt),
        }))
      );

      // 21. calendar_events
      await insert(
        tx,
        schema.calendarEvents,
        mockCalendarEvents.map((e) => ({
          id: det(e.id),
          schoolId: SCHOOL_UUID,
          title: e.title,
          description: e.description,
          startDate: e.startDate,
          endDate: e.endDate,
          type: e.type,
          createdById: det(e.createdById),
          createdAt: new Date(e.createdAt),
        }))
      );

      // 22. appointments
      await insert(
        tx,
        schema.appointments,
        mockAppointments.map((a) => ({
          id: det(a.id),
          schoolId: SCHOOL_UUID,
          guardianId: det(a.guardianId),
          studentId: det(a.studentId),
          teacherId: det(a.teacherId),
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
