// Strongly-typed shapes of the JSON columns on the `schools` row.

export type GradingBand = {
  min: number;
  max: number;
  grade: string;
  interpretation: string;
};

export type ScoreWeights = {
  exam: number;
  cat1: number;
  cat2: number;
  groupWork: number;
  projectWork: number;
};

// The fixed GES-standard grading config, from GET /school/grading-defaults.
// Distinct from a school's saved settings — this is the reset target.
export type GradingDefaults = {
  gradingBands: GradingBand[];
  scoreWeights: ScoreWeights;
  passMark: number;
};

export type NotificationDefaults = {
  onLessonPlanRejected: boolean;
  onAnnouncementPosted: boolean;
  onResultsPublished: boolean;
  onAppointmentActivity: boolean;
  onAppointmentDecided: boolean;
  onLeaveActivity: boolean;
  onLeaveDecided: boolean;
  onAttendanceAbsent: boolean;
  onAssignmentCreated: boolean;
  onSchemeActivity: boolean;
  onSchemeDecided: boolean;
};

export type SchoolTerm = {
  id: string;
  academicYear: string;
  term: number;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string;
};

export type SchoolSettings = {
  id: string;
  // Identity
  name: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  principalName: string | null;
  logoUrl: string | null;
  // Calendar. `currentTerm` is the resolved/effective value (auto-picked
  // from `terms` dates, or `currentTermOverride` if an Admin pinned one)
  // — never write it directly; PATCH `currentTermOverride` instead.
  academicYear: string;
  currentTerm: number;
  currentTermOverride: number | null;
  terms: SchoolTerm[];
  // Grading — gradingBands/scoreWeights are always resolved (GES
  // defaults or a custom override), never null; `gradingScale` is what
  // tells the UI whether they've actually been customized.
  gradingScale: string;
  gradingBands: GradingBand[];
  scoreWeights: ScoreWeights;
  passMark: number;
  // Communication
  emailFromName: string | null;
  emailReplyTo: string | null;
  notificationDefaults: NotificationDefaults;
  // Security — read-only today, not yet enforced by anything (see
  // SecurityTab.tsx)
  passwordMinLength: number;
  forcePasswordChangeOnFirstLogin: boolean;
  // Leave
  casualLeaveAnnualDays: number;
  // Branding
  defaultColorScheme: string;
  sidebarAccentHex: string | null;
};

export type { ActionResult } from "@/lib/action-result";
