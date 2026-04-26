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
  role: varchar("role", { length: 50 }).notNull(),                     // 'Admin' | 'DeputyHead' | 'HOD' | 'Teacher' | 'Parent'
  linkedId: varchar("linked_id", { length: 128 }),                    // FK to staff.id | students.id | guardians.id
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(true),
});

// ─── People ──────────────────────────────────────────────────────────────────

export const staff = pgTable("staff", {
  id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. STAFF-042
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  rank: varchar("rank", { length: 100 }),
  systemRole: varchar("system_role", { length: 50 }),                  // 'ClassTeacher' | 'HOD' | 'DeputyHead' etc.
  division: varchar("division", { length: 50 }),                       // 'JHS' | 'Primary' | 'KG'
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const students = pgTable("students", {
  id: varchar("id", { length: 50 }).primaryKey(),                      // e.g. UHAS-2026-0001
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
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
  division: varchar("division", { length: 50 }).notNull(),             // 'JHS' | 'Primary' | 'KG'
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  classTeacherId: varchar("class_teacher_id").references(() => staff.id),
});

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

// ─── Exams & Scores ──────────────────────────────────────────────────────────

export const exams = pgTable("exams", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),                    // e.g. "Mid-Term 1"
  type: varchar("type", { length: 50 }).notNull(),                     // 'MidTerm' | 'EndOfTerm' | 'ClassAssessment'
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
  classScore: integer("class_score"),
  examScore: integer("exam_score"),
  totalScore: integer("total_score"),
  grade: varchar("grade", { length: 5 }),                              // GES: '1' through '9'
  interpretation: varchar("interpretation", { length: 50 }),           // 'Excellent' | 'Very Good' etc.
  subjectPosition: integer("subject_position"),
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
