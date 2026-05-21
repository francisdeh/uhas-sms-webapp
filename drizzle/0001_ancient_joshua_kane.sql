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
ALTER TABLE "school_terms" ADD CONSTRAINT "school_terms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;