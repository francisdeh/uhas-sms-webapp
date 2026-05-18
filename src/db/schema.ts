import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Multi-Tenancy Anchor ────────────────────────────────────────────────────

export const schools = pgTable("schools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),     // e.g. "2025/2026"
  currentTerm: integer("current_term").notNull().default(1),
  gradingScale: varchar("grading_scale", { length: 50 }).default("GES_STANDARD"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Auth Bridge & RBAC ──────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: varchar("id", { length: 128 }).primaryKey(),                     // Firebase Auth UID
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: varchar("role", { length: 50 }).notNull(),                     // 'Admin' | 'DeputyHead' | 'Teacher' | 'Parent'
  linkedId: varchar("linked_id", { length: 128 }),                    // FK to staff.id | students.id | guardians.id
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(true),
});

// ─── People ──────────────────────────────────────────────────────────────────

export const staff = pgTable("staff", {
  id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. STAFF-042
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
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

export const students = pgTable("students", {
  id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. UHAS-2026-0001
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  middleName: varchar("middle_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  dob: date("dob"),
  gender: varchar("gender", { length: 10 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  address: text("address"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const guardians = pgTable("guardians", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  phone: varchar("phone", { length: 50 }),
});

export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: varchar("student_id").references(() => students.id).notNull(),
    guardianId: uuid("guardian_id").references(() => guardians.id).notNull(),
    relation: varchar("relation", { length: 50 }),                     // 'Mother' | 'Father' | 'Uncle' etc.
    isPrimary: boolean("is_primary").default(false),
  },
  (t) => ({ pk: primaryKey({ columns: [t.studentId, t.guardianId] }) })
);

// ─── Academic Structure ──────────────────────────────────────────────────────

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  name: varchar("name", { length: 50 }).notNull(),                     // e.g. "JHS 1A"
  division: varchar("division", { length: 50 }).notNull(),             // 'KG' | 'Lower Primary' | 'Upper Primary' | 'JHS'
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
});

// Junction: classes ↔ staff (allows multiple class teachers per class)
export const classTeachers = pgTable(
  "class_teachers",
  {
    classId: uuid("class_id").references(() => classes.id).notNull(),
    staffId: varchar("staff_id").references(() => staff.id).notNull(),
    isPrimary: boolean("is_primary").default(false),
  },
  (t) => ({ pk: primaryKey({ columns: [t.classId, t.staffId] }) })
);

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  division: varchar("division", { length: 50 }),
  category: varchar("category", { length: 50 }).default("Core"),       // 'Core' | 'Elective'
});

export const classSubjects = pgTable(
  "class_subjects",
  {
    classId: uuid("class_id").references(() => classes.id).notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id).notNull(),
    teacherId: varchar("teacher_id").references(() => staff.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.classId, t.subjectId] }) })
);

// Student ↔ class per academic year — drives promotion history
export const enrollments = pgTable("enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: varchar("student_id").references(() => students.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  status: varchar("status", { length: 50 }).default("Active").notNull(), // 'Active' | 'Completed' | 'Repeating'
  enrollmentDate: date("enrollment_date").notNull(),
});

// ─── Attendance ──────────────────────────────────────────────────────────────

export const attendanceSessions = pgTable("attendance_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  date: date("date").notNull(),
  term: integer("term").notNull(),
  submittedById: varchar("submitted_by_id").references(() => staff.id),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    sessionId: uuid("session_id").references(() => attendanceSessions.id).notNull(),
    studentId: varchar("student_id").references(() => students.id).notNull(),
    status: varchar("status", { length: 20 }).notNull(),               // 'present' | 'absent' | 'late'
    lateReason: varchar("late_reason", { length: 255 }),               // required when status = 'late'
    note: varchar("note", { length: 255 }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.studentId] }) })
);

// ─── Leave Requests ──────────────────────────────────────────────────────────

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  staffId: varchar("staff_id").references(() => staff.id).notNull(),
  type: varchar("type", { length: 100 }).notNull(),                    // 'sick' | 'maternity' | 'personal' | 'other'
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  approvedById: varchar("approved_by_id").references(() => staff.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Academic Planning ───────────────────────────────────────────────────────

export const lessonPlans = pgTable("lesson_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  teacherId: varchar("teacher_id").references(() => staff.id).notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  term: integer("term").notNull(),
  week: integer("week").notNull(),
  topic: varchar("topic", { length: 255 }),
  learningObjectives: text("learning_objectives"),
  teachingMethods: text("teaching_methods"),
  resources: text("resources"),
  assessmentPlan: text("assessment_plan"),
  fileUrl: varchar("file_url", { length: 500 }),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // 'draft' | 'submitted' | 'approved' | 'rejected'
  reviewerComment: text("reviewer_comment"),
  reviewedById: varchar("reviewed_by_id").references(() => staff.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Term-level Scheme of Work (SoW) and Scheme of Learning (SoL) submitted to
// Head of School. Teachers either upload a file URL or fill the structured
// content. One row per (teacherId, classId, subjectId, type, term).
export const schemes = pgTable("schemes", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  teacherId: varchar("teacher_id").references(() => staff.id).notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(),                     // 'work' | 'learning'
  term: integer("term").notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }),                       // upload path
  content: text("content"),                                            // structured/generated
  status: varchar("status", { length: 20 }).default("draft").notNull(),// 'draft' | 'submitted' | 'acknowledged'
  reviewerComment: text("reviewer_comment"),
  reviewedById: varchar("reviewed_by_id").references(() => staff.id),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Exams & Scores ──────────────────────────────────────────────────────────

export const exams = pgTable("exams", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),                    // e.g. "Mid-Term 1"
  type: varchar("type", { length: 50 }).notNull(),                     // 'MidTerm' | 'EndOfTerm'
  term: integer("term").notNull(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scores = pgTable("scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  examId: uuid("exam_id").references(() => exams.id).notNull(),
  studentId: varchar("student_id").references(() => students.id).notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id).notNull(),
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
});

// One row per (exam, class). Tracks the class-teacher submission to Head of School.
export const classReportSubmissions = pgTable("class_report_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  examId: uuid("exam_id").references(() => exams.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),  // 'draft' | 'submitted'
  submittedById: varchar("submitted_by_id").references(() => staff.id),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-student remarks on a given exam — class teacher fills 'classTeacherRemark',
// Head of School fills 'headOfSchoolComment'.
export const studentReportRemarks = pgTable("student_report_remarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  examId: uuid("exam_id").references(() => exams.id).notNull(),
  studentId: varchar("student_id").references(() => students.id).notNull(),
  classTeacherRemark: text("class_teacher_remark"),
  headOfSchoolComment: text("head_of_school_comment"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Assignments — published per class+subject by the teacher; visible to parents
// of students in the class once published.
export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  teacherId: varchar("teacher_id").references(() => staff.id).notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id).notNull(),
  classId: uuid("class_id").references(() => classes.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: varchar("file_url", { length: 500 }),
  dueDate: date("due_date").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),  // 'draft' | 'published'
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Announcements ───────────────────────────────────────────────────────────

export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  audience: varchar("audience", { length: 100 }).notNull(),            // 'all' | 'division:JHS' | 'class:uuid'
  isCritical: boolean("is_critical").default(false),
  createdById: varchar("created_by_id").references(() => staff.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Academic Calendar ───────────────────────────────────────────────────────

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  type: varchar("type", { length: 20 }).notNull(),                     // 'term_start' | 'term_end' | 'exam' | 'holiday' | 'event'
  createdById: varchar("created_by_id").references(() => staff.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Parent-Teacher Appointments ─────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  guardianId: uuid("guardian_id").references(() => guardians.id).notNull(),
  studentId: varchar("student_id").references(() => students.id).notNull(),
  teacherId: varchar("teacher_id").references(() => staff.id).notNull(),
  preferredDate: date("preferred_date").notNull(),
  preferredSlot: varchar("preferred_slot", { length: 50 }).notNull(),    // 'morning' | 'afternoon' | 'after_school'
  reason: text("reason"),                                                // why the parent wants to meet
  status: varchar("status", { length: 20 }).default("pending").notNull(),// 'pending' | 'confirmed' | 'declined' | 'cancelled'
  teacherResponse: text("teacher_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),                // e.g. 'SCORE_OVERRIDE' | 'STUDENT_EDIT'
  targetTable: varchar("target_table", { length: 100 }),
  targetId: varchar("target_id", { length: 128 }),
  before: text("before"),                                              // JSON snapshot
  after: text("after"),                                               // JSON snapshot
  createdAt: timestamp("created_at").defaultNow(),
});
