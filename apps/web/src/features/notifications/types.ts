import type { StaffSystemRole } from "@/features/auth/types";

// In-app notification kinds. Add new ones here; the lib/templates.ts
// resolver narrows on the union.
export type NotificationKind =
  | "lesson_plan_submitted"
  | "lesson_plan_reviewed"
  | "announcement_posted"
  | "attendance_absent"
  | "results_published"
  | "leave_request_submitted"
  | "leave_request_decided"
  | "promotion_season_opened"
  | "promotion_submitted"
  | "promotion_sent_back"
  | "promotion_approved"
  | "promotion_reminder"
  | "assignment_created";

// Audience spec — what `notifyAudience(...)` accepts. Each shape is
// resolved into a list of user IDs by audience.ts.
export type AudienceSpec =
  | { type: "user"; userId: string }
  | { type: "users"; userIds: string[] }
  | { type: "staff"; staffId: string }
  | { type: "staffByDivision"; division: string; roles?: StaffSystemRole[] }
  | { type: "unitHeadOfDivision"; division: string }
  | { type: "allTeachers" }
  | { type: "allAdmins" }
  | { type: "parentsOfStudents"; studentIds: string[] }
  | { type: "parentsOfClass"; classId: string }
  | { type: "parentsInDivision"; division: string }
  | { type: "allParents" }
  | { type: "schoolWide" };

// Read shape used by the dropdown.
export type NotificationView = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type { ActionResult } from "@/lib/action-result";
