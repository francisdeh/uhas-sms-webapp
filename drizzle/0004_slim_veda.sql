ALTER TABLE "assignments" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "schemes" ADD COLUMN "deleted_at" timestamp;