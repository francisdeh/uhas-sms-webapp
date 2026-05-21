// Strongly-typed shape of the JSON columns on the `schools` row. Drizzle
// returns these as `unknown`, so consumers cast through these helpers.

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

export type NotificationDefaults = {
  onLessonPlanRejected: boolean;
  onAnnouncementPosted: boolean;
  onResultsPublished: boolean;
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
  // Calendar
  academicYear: string;
  currentTerm: number;
  terms: SchoolTerm[];
  // Grading
  gradingScale: string;
  gradingBands: GradingBand[] | null;
  scoreWeights: ScoreWeights;
  passMark: number;
  // Communication
  emailFromName: string | null;
  emailReplyTo: string | null;
  notificationDefaults: NotificationDefaults;
  // Security
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  forcePasswordChangeOnFirstLogin: boolean;
  // Branding
  defaultColorScheme: string;
  sidebarAccentHex: string | null;
};

export type ActionResult = { success: true } | { success: false; error: string };
