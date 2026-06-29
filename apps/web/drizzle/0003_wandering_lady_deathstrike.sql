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
CREATE INDEX "users_linked_id_idx" ON "users" USING btree ("linked_id");