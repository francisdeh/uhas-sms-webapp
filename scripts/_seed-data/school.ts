// Default settings the school launches with. Admin can edit any of these
// at runtime via /admin/settings; nothing here is read directly from code
// at request time — all reads go through src/features/settings/queries.

export const DEFAULT_SCORE_WEIGHTS = {
  exam: 60,
  cat1: 10,
  cat2: 10,
  groupWork: 10,
  projectWork: 10,
};

export const DEFAULT_NOTIFICATION_DEFAULTS = {
  onLessonPlanRejected: true,
  onAnnouncementPosted: true,
  onResultsPublished: true,
};

export const mockSchool = {
  id: "school-uhas-001",
  name: "UHAS Basic School",
  academicYear: "2025/2026",
  currentTerm: 1,
  gradingScale: "GES_STANDARD",
  isActive: true,

  // Identity
  motto: "Knowledge for Service",
  address: "Hohoe, Volta Region, Ghana",
  phone: "+233 24 000 0000",
  email: "info@uhas.edu.gh",
  principalName: "Mawuli Agbenyega",
  logoUrl: null as string | null,

  // Grading — null means "use the GES_GRADES constant in code"
  gradingBands: null as null | unknown,
  scoreWeights: DEFAULT_SCORE_WEIGHTS,
  passMark: 40,

  // Communication
  emailFromName: "UHAS Basic School",
  emailReplyTo: "info@uhas.edu.gh",
  notificationDefaults: DEFAULT_NOTIFICATION_DEFAULTS,

  // Security
  sessionTimeoutMinutes: 480, // 8 hours
  passwordMinLength: 8,
  forcePasswordChangeOnFirstLogin: true,

  // Branding
  defaultColorScheme: "uhas",
  sidebarAccentHex: null as string | null,
};

// Three terms per academic year — these are placeholder ranges admins can
// edit in the Calendar tab. Drives report-card term headers + "current term"
// auto-detection. Roughly mirrors the Ghanaian basic-school calendar.
export const mockSchoolTerms = [
  { academicYear: "2025/2026", term: 1, startDate: "2025-09-08", endDate: "2025-12-19" },
  { academicYear: "2025/2026", term: 2, startDate: "2026-01-12", endDate: "2026-04-03" },
  { academicYear: "2025/2026", term: 3, startDate: "2026-04-27", endDate: "2026-07-31" },
  { academicYear: "2026/2027", term: 1, startDate: "2026-09-07", endDate: "2026-12-18" },
  { academicYear: "2026/2027", term: 2, startDate: "2027-01-11", endDate: "2027-04-02" },
  { academicYear: "2026/2027", term: 3, startDate: "2027-04-26", endDate: "2027-07-30" },
];
