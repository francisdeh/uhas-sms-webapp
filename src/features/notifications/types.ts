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
  | "assignment_created";

// Audience spec — what `notifyAudience(...)` accepts. Each shape is
// resolved into a list of user IDs by audience.ts.
export type AudienceSpec =
  | { type: "user"; userId: string }
  | { type: "users"; userIds: string[] }
  | { type: "staff"; staffId: string }
  | { type: "staffByDivision"; division: string; roles?: ("Admin" | "DeputyHead" | "Teacher")[] }
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

export type ActionResult = { success: true } | { success: false; error: string };
