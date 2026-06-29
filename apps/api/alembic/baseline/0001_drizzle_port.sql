CREATE TABLE "announcements" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"audience" varchar(100) NOT NULL,
	"is_critical" boolean DEFAULT false,
	"created_by_id" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"guardian_id" varchar(50) NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"teacher_id" varchar(50) NOT NULL,
	"preferred_date" date NOT NULL,
	"preferred_slot" varchar(50) NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"teacher_response" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"teacher_id" varchar(50) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"file_url" varchar(500),
	"due_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"session_id" varchar(80) NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"late_reason" varchar(255),
	"note" varchar(255),
	CONSTRAINT "attendance_records_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"term" integer NOT NULL,
	"submitted_by_id" varchar(50),
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_table" varchar(100),
	"target_id" varchar(128),
	"before" text,
	"after" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"type" varchar(20) NOT NULL,
	"created_by_id" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_report_submissions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"exam_id" varchar(80) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"submitted_by_id" varchar(50),
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"class_id" varchar(50) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"teacher_id" varchar(50),
	CONSTRAINT "class_subjects_class_id_subject_id_pk" PRIMARY KEY("class_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "class_teachers" (
	"class_id" varchar(50) NOT NULL,
	"staff_id" varchar(50) NOT NULL,
	"is_primary" boolean DEFAULT false,
	CONSTRAINT "class_teachers_class_id_staff_id_pk" PRIMARY KEY("class_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"name" varchar(50) NOT NULL,
	"division" varchar(50) NOT NULL,
	"academic_year" varchar(9) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"enrollment_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"term" integer NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	CONSTRAINT "guardians_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"staff_id" varchar(50) NOT NULL,
	"type" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"approved_by_id" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lesson_plans" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"teacher_id" varchar(50) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"term" integer NOT NULL,
	"week" integer NOT NULL,
	"topic" varchar(255),
	"learning_objectives" text,
	"teaching_methods" text,
	"resources" text,
	"assessment_plan" text,
	"file_url" varchar(500),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"reviewer_comment" text,
	"reviewed_by_id" varchar(50),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_decisions" (
	"id" varchar(140) PRIMARY KEY NOT NULL,
	"submission_id" varchar(100) NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"decision" varchar(20) NOT NULL,
	"target_class_id" varchar(50),
	"reason" text,
	"suggested_decision" varchar(20),
	"suggested_reason" text,
	"failed_core_subjects" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_seasons" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"status" varchar(20) DEFAULT 'closed' NOT NULL,
	"opened_with_override" boolean DEFAULT false,
	"opened_by_id" varchar(50),
	"opened_at" timestamp,
	"closed_by_id" varchar(50),
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_submissions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"submitted_by_id" varchar(50),
	"submitted_at" timestamp,
	"reviewer_comment" text,
	"reviewed_by_id" varchar(50),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"teacher_id" varchar(50) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"class_id" varchar(50) NOT NULL,
	"type" varchar(20) NOT NULL,
	"term" integer NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"title" varchar(255) NOT NULL,
	"file_url" varchar(500),
	"content" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"reviewer_comment" text,
	"reviewed_by_id" varchar(50),
	"reviewed_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"current_term" integer DEFAULT 1 NOT NULL,
	"grading_scale" varchar(50) DEFAULT 'GES_STANDARD',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"exam_id" varchar(80) NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"cat1" integer,
	"cat2" integer,
	"project_work" integer,
	"group_work" integer,
	"exam_score" integer,
	"total_score" integer,
	"grade" varchar(5),
	"interpretation" varchar(50),
	"subject_position" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"uhas_id" varchar(50),
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"rank" varchar(100),
	"system_role" varchar(50),
	"division" varchar(50),
	"is_unit_head" boolean DEFAULT false,
	"unit_head_of" varchar(50),
	"photo_url" varchar(500),
	"phone" varchar(50),
	"email" varchar(255),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "staff_uhas_id_unique" UNIQUE("uhas_id")
);
--> statement-breakpoint
CREATE TABLE "staff_attendance_records" (
	"session_id" varchar(80) NOT NULL,
	"staff_id" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"note" varchar(255),
	CONSTRAINT "staff_attendance_records_session_id_staff_id_pk" PRIMARY KEY("session_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "staff_attendance_sessions" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"division" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"term" integer NOT NULL,
	"submitted_by_id" varchar(50),
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"student_id" varchar(50) NOT NULL,
	"guardian_id" varchar(50) NOT NULL,
	"relation" varchar(50),
	"is_primary" boolean DEFAULT false,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "student_report_remarks" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"exam_id" varchar(80) NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"class_teacher_remark" text,
	"head_of_school_comment" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"middle_name" varchar(255),
	"last_name" varchar(255) NOT NULL,
	"dob" date,
	"gender" varchar(10),
	"photo_url" varchar(500),
	"phone" varchar(50),
	"address" text,
	"nationality" varchar(100),
	"religion" varchar(100),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"division" varchar(50),
	"category" varchar(50) DEFAULT 'Core'
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"linked_id" varchar(128),
	"is_active" boolean DEFAULT true,
	"must_change_password" boolean DEFAULT true,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_submitted_by_id_staff_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_submissions" ADD CONSTRAINT "class_report_submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_submissions" ADD CONSTRAINT "class_report_submissions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_submissions" ADD CONSTRAINT "class_report_submissions_submitted_by_id_staff_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_id_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_reviewed_by_id_staff_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_submission_id_promotion_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."promotion_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_target_class_id_classes_id_fk" FOREIGN KEY ("target_class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_seasons" ADD CONSTRAINT "promotion_seasons_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_seasons" ADD CONSTRAINT "promotion_seasons_opened_by_id_staff_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_seasons" ADD CONSTRAINT "promotion_seasons_closed_by_id_staff_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_submissions" ADD CONSTRAINT "promotion_submissions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_submissions" ADD CONSTRAINT "promotion_submissions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_submissions" ADD CONSTRAINT "promotion_submissions_submitted_by_id_staff_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_submissions" ADD CONSTRAINT "promotion_submissions_reviewed_by_id_staff_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_reviewed_by_id_staff_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_session_id_staff_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."staff_attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_submitted_by_id_staff_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_report_remarks" ADD CONSTRAINT "student_report_remarks_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_report_remarks" ADD CONSTRAINT "student_report_remarks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "school_terms" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"academic_year" varchar(9) NOT NULL,
	"term" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "school_terms_school_id_academic_year_term_unique" UNIQUE("school_id","academic_year","term")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "motto" varchar(255);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "principal_name" varchar(255);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "grading_bands" jsonb;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "score_weights" jsonb;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "pass_mark" integer DEFAULT 40;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email_from_name" varchar(255);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email_reply_to" varchar(255);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "notification_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "session_timeout_minutes" integer DEFAULT 480;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "password_min_length" integer DEFAULT 8;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "force_password_change_on_first_login" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "default_color_scheme" varchar(20) DEFAULT 'uhas';--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "sidebar_accent_hex" varchar(7);--> statement-breakpoint
ALTER TABLE "school_terms" ADD CONSTRAINT "school_terms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"kind" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"link" varchar(500),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "announcements_school_created_idx" ON "announcements" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_class_date_idx" ON "attendance_sessions" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX "audit_log_action_created_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "classes_school_year_idx" ON "classes" USING btree ("school_id","academic_year");--> statement-breakpoint
CREATE INDEX "enrollments_student_year_idx" ON "enrollments" USING btree ("student_id","academic_year");--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "exams_school_year_term_idx" ON "exams" USING btree ("school_id","academic_year","term");--> statement-breakpoint
CREATE INDEX "lesson_plans_teacher_status_idx" ON "lesson_plans" USING btree ("teacher_id","status");--> statement-breakpoint
CREATE INDEX "lesson_plans_school_status_idx" ON "lesson_plans" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "scores_exam_subject_idx" ON "scores" USING btree ("exam_id","subject_id");--> statement-breakpoint
CREATE INDEX "scores_student_exam_idx" ON "scores" USING btree ("student_id","exam_id");--> statement-breakpoint
CREATE INDEX "staff_attendance_sessions_div_date_idx" ON "staff_attendance_sessions" USING btree ("division","date");--> statement-breakpoint
CREATE INDEX "students_school_active_idx" ON "students" USING btree ("school_id","is_active");--> statement-breakpoint
CREATE INDEX "users_linked_id_idx" ON "users" USING btree ("linked_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "schemes" ADD COLUMN "deleted_at" timestamp;