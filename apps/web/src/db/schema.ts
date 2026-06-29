import {
  pgTable,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  text,
  jsonb,
  primaryKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// All entity IDs are varchar to preserve the human-readable IDs from the
// original fixtures (e.g. "STAFF-001", "class-jhs1"). Runtime-created rows
// generate IDs as `<prefix>-<timestamp>-<rand>` or via crypto.randomUUID().

// ─── Multi-Tenancy Anchor ────────────────────────────────────────────────────

export const schools = pgTable("schools", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),     // e.g. "2025/2026"
  currentTerm: integer("current_term").notNull().default(1),
  gradingScale: varchar("grading_scale", { length: 50 }).default("GES_STANDARD"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  // ── Identity (Admin Settings → Identity tab) ─────────────────────────────
  motto: varchar("motto", { length: 255 }),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  principalName: varchar("principal_name", { length: 255 }),
  logoUrl: varchar("logo_url", { length: 500 }),

  // ── Grading (Admin Settings → Grading tab) ───────────────────────────────
  // Shape: Array<{ min:number; max:number; grade:string; interpretation:string }>
  // Falls back to GES_GRADES constant in src/features/exams/utils.ts when null.
  gradingBands: jsonb("grading_bands"),
  // Shape: { exam:number; cat1:number; cat2:number; groupWork:number; projectWork:number } (sum = 100)
  scoreWeights: jsonb("score_weights"),
  passMark: integer("pass_mark").default(40),

  // ── Communication defaults (Admin Settings → Communication tab) ──────────
  emailFromName: varchar("email_from_name", { length: 255 }),
  emailReplyTo: varchar("email_reply_to", { length: 255 }),
  // Shape: { onLessonPlanRejected:bool; onAnnouncementPosted:bool; onResultsPublished:bool }
  notificationDefaults: jsonb("notification_defaults"),

  // ── Security (Admin Settings → Security tab) ─────────────────────────────
  sessionTimeoutMinutes: integer("session_timeout_minutes").default(480),  // 8h
  passwordMinLength: integer("password_min_length").default(8),
  forcePasswordChangeOnFirstLogin: boolean("force_password_change_on_first_login").default(true),

  // ── Branding (Admin Settings → Branding tab) ─────────────────────────────
  defaultColorScheme: varchar("default_color_scheme", { length: 20 }).default("uhas"),
  sidebarAccentHex: varchar("sidebar_accent_hex", { length: 7 }),
});

// Term date ranges per academic year. Drives report-card term headers + the
// "current term" auto-pick on dashboards. One row per (school, year, term).
export const schoolTerms = pgTable("school_terms", {
  id: varchar("id", { length: 64 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  term: integer("term").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
}, (t) => ({
  uniqueTerm: unique().on(t.schoolId, t.academicYear, t.term),
}));

// ─── Auth Bridge & RBAC ──────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 128 }).primaryKey(),                     // Firebase Auth UID
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    role: varchar("role", { length: 50 }).notNull(),                     // 'Admin' | 'DeputyHead' | 'Teacher' | 'Parent'
    linkedId: varchar("linked_id", { length: 128 }),                    // FK to staff.id | students.id | guardians.id
    isActive: boolean("is_active").default(true),
    mustChangePassword: boolean("must_change_password").default(true),
  },
  (t) => [
    // loginAction falls back from id-lookup to email-lookup (already indexed
    // by uniqueness); listUsersAction joins staff and guardians on linkedId.
    index("users_linked_id_idx").on(t.linkedId),
  ]
);

// ─── People ──────────────────────────────────────────────────────────────────

export const staff = pgTable("staff", {
  id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. STAFF-042
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  uhasId: varchar("uhas_id", { length: 50 }).unique(),                 // University staff ID, e.g. UHAS1141
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  rank: varchar("rank", { length: 100 }),
  systemRole: varchar("system_role", { length: 50 }),                  // 'Admin' | 'DeputyHead' | 'Teacher'
  division: varchar("division", { length: 50 }),                       // 'KG' | 'Lower Primary' | 'Upper Primary' | 'JHS'
  isUnitHead: boolean("is_unit_head").default(false),
  unitHeadOf: varchar("unit_head_of", { length: 50 }),                 // division this staff is Unit Head of (when isUnitHead)
  photoUrl: varchar("photo_url", { length: 500 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const students = pgTable(
  "students",
  {
    id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. UHAS-2026-0001
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    middleName: varchar("middle_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    dob: date("dob"),
    gender: varchar("gender", { length: 10 }),
    photoUrl: varchar("photo_url", { length: 500 }),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    nationality: varchar("nationality", { length: 100 }),
    religion: varchar("religion", { length: 100 }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    // Students list / search filtered by school + active status.
    index("students_school_active_idx").on(t.schoolId, t.isActive),
  ]
);

export const guardians = pgTable("guardians", {
  id: varchar("id", { length: 50 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  phone: varchar("phone", { length: 50 }),
});

export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
    guardianId: varchar("guardian_id", { length: 50 }).references(() => guardians.id).notNull(),
    relation: varchar("relation", { length: 50 }),                     // 'Mother' | 'Father' | 'Uncle' etc.
    isPrimary: boolean("is_primary").default(false),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] })]
);

// ─── Academic Structure ──────────────────────────────────────────────────────

export const classes = pgTable(
  "classes",
  {
    id: varchar("id", { length: 50 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    name: varchar("name", { length: 50 }).notNull(),                     // e.g. "JHS 1"
    division: varchar("division", { length: 50 }).notNull(),             // 'KG' | 'Lower Primary' | 'Upper Primary' | 'JHS'
    academicYear: varchar("academic_year", { length: 9 }).notNull(),
  },
  (t) => [
    // listClassesAction filters by (school, year, optional division).
    index("classes_school_year_idx").on(t.schoolId, t.academicYear),
  ]
);

// Junction: classes ↔ staff (allows multiple class teachers per class)
export const classTeachers = pgTable(
  "class_teachers",
  {
    classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
    staffId: varchar("staff_id", { length: 50 }).references(() => staff.id).notNull(),
    isPrimary: boolean("is_primary").default(false),
  },
  (t) => [primaryKey({ columns: [t.classId, t.staffId] })]
);

export const subjects = pgTable("subjects", {
  id: varchar("id", { length: 50 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  division: varchar("division", { length: 50 }),
  category: varchar("category", { length: 50 }).default("Core"),       // 'Core' | 'Elective'
});

export const classSubjects = pgTable(
  "class_subjects",
  {
    classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
    subjectId: varchar("subject_id", { length: 50 }).references(() => subjects.id).notNull(),
    teacherId: varchar("teacher_id", { length: 50 }).references(() => staff.id),
  },
  (t) => [primaryKey({ columns: [t.classId, t.subjectId] })]
);

// Student ↔ class per academic year — drives promotion history
export const enrollments = pgTable(
  "enrollments",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
    classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
    academicYear: varchar("academic_year", { length: 9 }).notNull(),
    status: varchar("status", { length: 50 }).default("Active").notNull(), // 'Active' | 'Completed' | 'Repeating'
    enrollmentDate: date("enrollment_date").notNull(),
  },
  (t) => [
    // Resolve a student's class for the current year.
    index("enrollments_student_year_idx").on(t.studentId, t.academicYear),
    // Class roster: who's in classId for the active year.
    index("enrollments_class_idx").on(t.classId),
  ]
);

// ─── Attendance ──────────────────────────────────────────────────────────────

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
    date: date("date").notNull(),
    term: integer("term").notNull(),
    submittedById: varchar("submitted_by_id", { length: 50 }).references(() => staff.id),
    submittedAt: timestamp("submitted_at").defaultNow(),
  },
  (t) => [
    // Locate the session for a class on a specific date — done every page
    // load on the attendance sheet and every parent attendance lookup.
    index("attendance_sessions_class_date_idx").on(t.classId, t.date),
  ]
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    sessionId: varchar("session_id", { length: 80 }).references(() => attendanceSessions.id).notNull(),
    studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
    status: varchar("status", { length: 20 }).notNull(),               // 'present' | 'absent' | 'late'
    lateReason: varchar("late_reason", { length: 255 }),               // required when status = 'late'
    note: varchar("note", { length: 255 }),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.studentId] }),
    // Roster lookups (all records for a session) and per-student history
    // (every record for studentId across sessions).
    index("attendance_records_student_idx").on(t.studentId),
  ]
);

// ─── Staff Attendance ───────────────────────────────────────────────────────

export const staffAttendanceSessions = pgTable(
  "staff_attendance_sessions",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    division: varchar("division", { length: 50 }).notNull(),               // 'KG' | 'Lower Primary' | 'Upper Primary' | 'JHS'
    date: date("date").notNull(),
    term: integer("term").notNull(),
    submittedById: varchar("submitted_by_id", { length: 50 }).references(() => staff.id),
    submittedAt: timestamp("submitted_at").defaultNow(),
  },
  (t) => [
    // Find existing session for (division, date) — the DH page loads this
    // on every staff-attendance render.
    index("staff_attendance_sessions_div_date_idx").on(t.division, t.date),
  ]
);

export const staffAttendanceRecords = pgTable(
  "staff_attendance_records",
  {
    sessionId: varchar("session_id", { length: 80 }).references(() => staffAttendanceSessions.id).notNull(),
    staffId: varchar("staff_id", { length: 50 }).references(() => staff.id).notNull(),
    status: varchar("status", { length: 20 }).notNull(),                 // 'present' | 'absent' | 'on_leave'
    note: varchar("note", { length: 255 }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.staffId] })]
);

// ─── Leave Requests ──────────────────────────────────────────────────────────

export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  staffId: varchar("staff_id", { length: 50 }).references(() => staff.id).notNull(),
  type: varchar("type", { length: 100 }).notNull(),                    // 'sick' | 'maternity' | 'personal' | 'other'
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  approvedById: varchar("approved_by_id", { length: 50 }).references(() => staff.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Academic Planning ───────────────────────────────────────────────────────

export const lessonPlans = pgTable(
  "lesson_plans",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    teacherId: varchar("teacher_id", { length: 50 }).references(() => staff.id).notNull(),
    subjectId: varchar("subject_id", { length: 50 }).references(() => subjects.id).notNull(),
    classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
    term: integer("term").notNull(),
    week: integer("week").notNull(),
    topic: varchar("topic", { length: 255 }),
    learningObjectives: text("learning_objectives"),
    teachingMethods: text("teaching_methods"),
    resources: text("resources"),
    assessmentPlan: text("assessment_plan"),
    fileUrl: varchar("file_url", { length: 500 }),
    status: varchar("status", { length: 50 }).default("draft").notNull(), // 'draft' | 'submitted' | 'unit_head_approved' | 'approved' | 'rejected'
    reviewerComment: text("reviewer_comment"),
    reviewedById: varchar("reviewed_by_id", { length: 50 }).references(() => staff.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Soft-delete marker. Reads filter by `deletedAt IS NULL`; deletes
    // set this rather than removing the row, so accidental deletions can be
    // recovered (TBD admin Trash UI). Hard-delete remains available for
    // permanent removal via direct SQL or a future admin tool.
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    // Teacher dashboard: my plans grouped by status.
    index("lesson_plans_teacher_status_idx").on(t.teacherId, t.status),
    // Unit Head + DH review queues filter by status across all teachers.
    index("lesson_plans_school_status_idx").on(t.schoolId, t.status),
  ]
);

// Term-level Scheme of Work (SoW) and Scheme of Learning (SoL) submitted to
// Head of School. Teachers either upload a file URL or fill the structured
// content. One row per (teacherId, classId, subjectId, type, term).
export const schemes = pgTable("schemes", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  teacherId: varchar("teacher_id", { length: 50 }).references(() => staff.id).notNull(),
  subjectId: varchar("subject_id", { length: 50 }).references(() => subjects.id).notNull(),
  classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(),                     // 'work' | 'learning'
  term: integer("term").notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }),                       // upload path
  content: text("content"),                                            // structured/generated
  status: varchar("status", { length: 20 }).default("draft").notNull(),// 'draft' | 'submitted' | 'acknowledged'
  reviewerComment: text("reviewer_comment"),
  reviewedById: varchar("reviewed_by_id", { length: 50 }).references(() => staff.id),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Soft-delete marker. See lessonPlans.deletedAt for the rationale.
  deletedAt: timestamp("deleted_at"),
});

// ─── Exams & Scores ──────────────────────────────────────────────────────────

export const exams = pgTable(
  "exams",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    name: varchar("name", { length: 100 }).notNull(),                    // e.g. "Mid-Term 1"
    type: varchar("type", { length: 50 }).notNull(),                     // 'MidTerm' | 'EndOfTerm'
    term: integer("term").notNull(),
    academicYear: varchar("academic_year", { length: 9 }).notNull(),
    isPublished: boolean("is_published").default(false),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    // Exam list filters by (school, year, term).
    index("exams_school_year_term_idx").on(t.schoolId, t.academicYear, t.term),
  ]
);

export const scores = pgTable(
  "scores",
  {
    id: varchar("id", { length: 120 }).primaryKey(),
    examId: varchar("exam_id", { length: 80 }).references(() => exams.id).notNull(),
    studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
    subjectId: varchar("subject_id", { length: 50 }).references(() => subjects.id).notNull(),
    // End-of-term components (all 0-100, nullable). Mid-Term ignores these.
    cat1: integer("cat1"),
    cat2: integer("cat2"),
    projectWork: integer("project_work"),
    groupWork: integer("group_work"),
    // Exam score (0-100). Mid-Term: raw exam = total. End-of-Term: weighted into total.
    examScore: integer("exam_score"),
    // Derived
    totalScore: integer("total_score"),                                  // rounded 0-100
    grade: varchar("grade", { length: 5 }),                              // '1' through '9'
    interpretation: varchar("interpretation", { length: 50 }),           // 'Highest', 'Higher', etc.
    subjectPosition: integer("subject_position"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    // Score grid for a class subject — most-traffic exam query.
    index("scores_exam_subject_idx").on(t.examId, t.subjectId),
    // Student report card — all scores for one student in one exam.
    index("scores_student_exam_idx").on(t.studentId, t.examId),
  ]
);

// One row per (exam, class). Tracks the class-teacher submission to Head of School.
export const classReportSubmissions = pgTable("class_report_submissions", {
  id: varchar("id", { length: 100 }).primaryKey(),
  examId: varchar("exam_id", { length: 80 }).references(() => exams.id).notNull(),
  classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),  // 'draft' | 'submitted'
  submittedById: varchar("submitted_by_id", { length: 50 }).references(() => staff.id),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-student remarks on a given exam — class teacher fills 'classTeacherRemark',
// Head of School fills 'headOfSchoolComment'.
export const studentReportRemarks = pgTable("student_report_remarks", {
  id: varchar("id", { length: 120 }).primaryKey(),
  examId: varchar("exam_id", { length: 80 }).references(() => exams.id).notNull(),
  studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
  classTeacherRemark: text("class_teacher_remark"),
  headOfSchoolComment: text("head_of_school_comment"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Assignments — published per class+subject by the teacher; visible to parents
// of students in the class once published.
export const assignments = pgTable("assignments", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  teacherId: varchar("teacher_id", { length: 50 }).references(() => staff.id).notNull(),
  subjectId: varchar("subject_id", { length: 50 }).references(() => subjects.id).notNull(),
  classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: varchar("file_url", { length: 500 }),
  dueDate: date("due_date").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),  // 'draft' | 'published'
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Soft-delete marker. See lessonPlans.deletedAt for the rationale.
  deletedAt: timestamp("deleted_at"),
});

// ─── Announcements ───────────────────────────────────────────────────────────

export const announcements = pgTable(
  "announcements",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    audience: varchar("audience", { length: 100 }).notNull(),            // 'all' | 'division:JHS' | 'class:<id>'
    isCritical: boolean("is_critical").default(false),
    createdById: varchar("created_by_id", { length: 50 }).references(() => staff.id).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    // Recent announcements query: ORDER BY createdAt DESC LIMIT N.
    index("announcements_school_created_idx").on(t.schoolId, t.createdAt),
  ]
);

// ─── Academic Calendar ───────────────────────────────────────────────────────

export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  type: varchar("type", { length: 20 }).notNull(),                     // 'term_start' | 'term_end' | 'exam' | 'holiday' | 'event'
  createdById: varchar("created_by_id", { length: 50 }).references(() => staff.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Parent-Teacher Appointments ─────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  guardianId: varchar("guardian_id", { length: 50 }).references(() => guardians.id).notNull(),
  studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
  teacherId: varchar("teacher_id", { length: 50 }).references(() => staff.id).notNull(),
  preferredDate: date("preferred_date").notNull(),
  preferredSlot: varchar("preferred_slot", { length: 50 }).notNull(),    // 'morning' | 'afternoon' | 'after_school'
  reason: text("reason"),                                                // why the parent wants to meet
  status: varchar("status", { length: 20 }).default("pending").notNull(),// 'pending' | 'confirmed' | 'declined' | 'cancelled'
  teacherResponse: text("teacher_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Student Promotion ───────────────────────────────────────────────────────

// One row per (school × academicYear) gating the whole promotion workflow.
export const promotionSeasons = pgTable("promotion_seasons", {
  id: varchar("id", { length: 80 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  status: varchar("status", { length: 20 }).default("closed").notNull(),  // 'open' | 'closed'
  openedWithOverride: boolean("opened_with_override").default(false),
  openedById: varchar("opened_by_id", { length: 50 }).references(() => staff.id),
  openedAt: timestamp("opened_at"),
  closedById: varchar("closed_by_id", { length: 50 }).references(() => staff.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const promotionSubmissions = pgTable("promotion_submissions", {
  id: varchar("id", { length: 100 }).primaryKey(),
  schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
  classId: varchar("class_id", { length: 50 }).references(() => classes.id).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),    // 'draft' | 'submitted' | 'approved' | 'sent_back'
  submittedById: varchar("submitted_by_id", { length: 50 }).references(() => staff.id),
  submittedAt: timestamp("submitted_at"),
  reviewerComment: text("reviewer_comment"),
  reviewedById: varchar("reviewed_by_id", { length: 50 }).references(() => staff.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const promotionDecisions = pgTable("promotion_decisions", {
  id: varchar("id", { length: 140 }).primaryKey(),
  submissionId: varchar("submission_id", { length: 100 }).references(() => promotionSubmissions.id).notNull(),
  studentId: varchar("student_id", { length: 50 }).references(() => students.id).notNull(),
  decision: varchar("decision", { length: 20 }).notNull(),                 // 'promote' | 'repeat' | 'withdraw' | 'graduate'
  targetClassId: varchar("target_class_id", { length: 50 }).references(() => classes.id),
  reason: text("reason"),
  suggestedDecision: varchar("suggested_decision", { length: 20 }),
  suggestedReason: text("suggested_reason"),
  failedCoreSubjects: integer("failed_core_subjects"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),                // e.g. 'SCORE_OVERRIDE' | 'STUDENT_EDIT'
    targetTable: varchar("target_table", { length: 100 }),
    targetId: varchar("target_id", { length: 128 }),
    before: text("before"),                                              // JSON snapshot
    after: text("after"),                                               // JSON snapshot
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    // Audit log viewer filters by (action, date range).
    index("audit_log_action_created_idx").on(t.action, t.createdAt),
    // "Who did what" — single-user audit history.
    index("audit_log_user_idx").on(t.userId),
    // "What happened to this row" — single-target history (planned filter).
    index("audit_log_target_idx").on(t.targetTable, t.targetId),
  ]
);

// ─── In-App Notifications ────────────────────────────────────────────────────
// One row per (recipient, event). The bell dropdown reads from here; events
// in feature actions write here via notifyAudience() in
// src/features/notifications/lib.

export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),                    // notif-<ts>-<rand>
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    userId: varchar("user_id", { length: 128 }).references(() => users.id).notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),                   // see NotificationKind union
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    link: varchar("link", { length: 500 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Bell badge: WHERE userId=? AND readAt IS NULL — partial would be ideal
    // but Drizzle doesn't model it; composite covers list + count queries.
    userReadIdx: index("notifications_user_read_idx").on(t.userId, t.readAt),
  })
);

// ─── Relations (Drizzle joins) ───────────────────────────────────────────────
// These let queries fetch related rows in a single round-trip via `with`:
//
//   db.query.lessonPlans.findFirst({
//     where: eq(lessonPlans.id, id),
//     with: { teacher: true, subject: true, class: true },
//   });
//
// Replaces the manual Promise.all + Map pattern in hydrateMany etc.

export const usersRelations = relations(users, ({ one }) => ({
  school: one(schools, { fields: [users.schoolId], references: [schools.id] }),
  // linkedId points at staff OR guardians depending on role; relations() only
  // supports one target, so we leave it unmodelled and join manually where
  // needed (e.g. listUsersAction).
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  school: one(schools, { fields: [staff.schoolId], references: [schools.id] }),
  // Reverse sides — keep what hot paths actually need.
  lessonPlans: many(lessonPlans),
  schemes: many(schemes),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  school: one(schools, { fields: [students.schoolId], references: [schools.id] }),
  enrollments: many(enrollments),
  scores: many(scores),
  attendance: many(attendanceRecords),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  school: one(schools, { fields: [classes.schoolId], references: [schools.id] }),
  enrollments: many(enrollments),
  attendanceSessions: many(attendanceSessions),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  class: one(classes, { fields: [enrollments.classId], references: [classes.id] }),
}));

export const attendanceSessionsRelations = relations(attendanceSessions, ({ one, many }) => ({
  school: one(schools, { fields: [attendanceSessions.schoolId], references: [schools.id] }),
  class: one(classes, { fields: [attendanceSessions.classId], references: [classes.id] }),
  submittedBy: one(staff, { fields: [attendanceSessions.submittedById], references: [staff.id] }),
  records: many(attendanceRecords),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  session: one(attendanceSessions, {
    fields: [attendanceRecords.sessionId],
    references: [attendanceSessions.id],
  }),
  student: one(students, { fields: [attendanceRecords.studentId], references: [students.id] }),
}));

export const lessonPlansRelations = relations(lessonPlans, ({ one }) => ({
  school: one(schools, { fields: [lessonPlans.schoolId], references: [schools.id] }),
  teacher: one(staff, { fields: [lessonPlans.teacherId], references: [staff.id], relationName: "lessonPlanTeacher" }),
  reviewer: one(staff, { fields: [lessonPlans.reviewedById], references: [staff.id], relationName: "lessonPlanReviewer" }),
  subject: one(subjects, { fields: [lessonPlans.subjectId], references: [subjects.id] }),
  class: one(classes, { fields: [lessonPlans.classId], references: [classes.id] }),
}));

export const schemesRelations = relations(schemes, ({ one }) => ({
  teacher: one(staff, { fields: [schemes.teacherId], references: [staff.id], relationName: "schemeTeacher" }),
  reviewer: one(staff, { fields: [schemes.reviewedById], references: [staff.id], relationName: "schemeReviewer" }),
  subject: one(subjects, { fields: [schemes.subjectId], references: [subjects.id] }),
  class: one(classes, { fields: [schemes.classId], references: [classes.id] }),
}));

export const examsRelations = relations(exams, ({ many }) => ({
  scores: many(scores),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  exam: one(exams, { fields: [scores.examId], references: [exams.id] }),
  student: one(students, { fields: [scores.studentId], references: [students.id] }),
  subject: one(subjects, { fields: [scores.subjectId], references: [subjects.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  createdBy: one(staff, { fields: [announcements.createdById], references: [staff.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
