import type { Announcement } from "@/features/announcements/types";

// Re-export for the few callers that still import the old name.
export type MockAnnouncement = Announcement;

export const mockAnnouncements: Announcement[] = [
  {
    id: "ann-001",
    schoolId: "school-uhas-001",
    title: "Term 1 Examination Timetable Released",
    body:
      "The End of Term 1 examination timetable has been released. Please check the notice board for details. Examinations begin on 12th May 2026.",
    audience: "all",
    isCritical: true,
    createdById: "STAFF-001",
    createdByName: "Emmanuel Asante",
    createdAt: "2026-04-20T09:00:00Z",
  },
  {
    id: "ann-002",
    schoolId: "school-uhas-001",
    title: "JHS Staff Meeting — Wednesday",
    body:
      "All JHS staff are reminded of the departmental meeting scheduled for Wednesday 29th April at 3:00pm in the staff common room.",
    audience: "division:JHS",
    isCritical: false,
    createdById: "STAFF-002",
    createdByName: "Abena Mensah",
    createdAt: "2026-04-24T14:30:00Z",
  },
  {
    id: "ann-003",
    schoolId: "school-uhas-001",
    title: "School Reopens — Term 2",
    body:
      "Term 2 begins on Monday 15th September 2026. All students are expected to report by 7:30am.",
    audience: "all",
    isCritical: false,
    createdById: "STAFF-001",
    createdByName: "Emmanuel Asante",
    createdAt: "2026-04-22T11:00:00Z",
  },
];
