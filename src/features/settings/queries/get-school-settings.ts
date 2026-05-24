import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { schools, schoolTerms } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import type {
  SchoolSettings,
  ScoreWeights,
  NotificationDefaults,
  GradingBand,
} from "@/features/settings/types";

// Cache tag for invalidating school settings across requests. Any action
// that mutates `schools` or `school_terms` should call
// `revalidateTag(SCHOOL_SETTINGS_TAG)` so subsequent reads pick up the
// change. See applySchoolSettingsPatch + setSchoolTermsAction.
export const SCHOOL_SETTINGS_TAG = "school-settings";

// Defaults used when a column is null on the row (fresh install / new tenant).
// These mirror the values seeded by scripts/_seed-data/school.ts.
const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  exam: 60,
  cat1: 10,
  cat2: 10,
  groupWork: 10,
  projectWork: 10,
};

const DEFAULT_NOTIFICATIONS: NotificationDefaults = {
  onLessonPlanRejected: true,
  onAnnouncementPosted: true,
  onResultsPublished: true,
};

// Two layers of caching:
//
//   1. unstable_cache — process-level cache, persists across requests.
//      Invalidated only by revalidateTag(SCHOOL_SETTINGS_TAG) when an admin
//      saves the settings page. Settings change rarely, so this is a big
//      Neon-cost reduction (one DB read per setting-change vs one per page
//      render).
//
//   2. React cache() — request-level dedup. Multiple Server Components in
//      the same render call this; React.cache ensures the unstable_cache
//      layer is hit just once per request even before checking the
//      cross-request cache.
//
// The cache key is the school ID (pass-through). With multi-tenancy the
// keyed cache scales per tenant — no work needed.
async function fetchSchoolSettings(schoolId: string): Promise<SchoolSettings> {
  const row = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  if (!row) {
    throw new Error(`School row not found: ${schoolId}`);
  }
  const terms = await db.query.schoolTerms.findMany({
    where: eq(schoolTerms.schoolId, schoolId),
    orderBy: [asc(schoolTerms.academicYear), asc(schoolTerms.term)],
  });

  return {
    id: row.id,
    name: row.name,
    motto: row.motto,
    address: row.address,
    phone: row.phone,
    email: row.email,
    principalName: row.principalName,
    logoUrl: row.logoUrl,
    academicYear: row.academicYear,
    currentTerm: row.currentTerm,
    terms: terms.map((t) => ({
      id: t.id,
      academicYear: t.academicYear,
      term: t.term,
      // Drizzle's `date` column is typed as string in @drizzle-orm/pg-core when
      // the SQL type is DATE; the rest of the app already relies on this.
      startDate: t.startDate as unknown as string,
      endDate: t.endDate as unknown as string,
    })),
    gradingScale: row.gradingScale ?? "GES_STANDARD",
    gradingBands: (row.gradingBands as GradingBand[] | null) ?? null,
    scoreWeights: (row.scoreWeights as ScoreWeights | null) ?? DEFAULT_SCORE_WEIGHTS,
    passMark: row.passMark ?? 40,
    emailFromName: row.emailFromName,
    emailReplyTo: row.emailReplyTo,
    notificationDefaults:
      (row.notificationDefaults as NotificationDefaults | null) ?? DEFAULT_NOTIFICATIONS,
    sessionTimeoutMinutes: row.sessionTimeoutMinutes ?? 480,
    passwordMinLength: row.passwordMinLength ?? 8,
    forcePasswordChangeOnFirstLogin: row.forcePasswordChangeOnFirstLogin ?? true,
    defaultColorScheme: row.defaultColorScheme ?? "uhas",
    sidebarAccentHex: row.sidebarAccentHex,
  };
}

const fetchSchoolSettingsCached = unstable_cache(
  fetchSchoolSettings,
  ["school-settings"],
  { tags: [SCHOOL_SETTINGS_TAG] }
);

export const getSchoolSettings = cache(async (): Promise<SchoolSettings> => {
  const schoolId = await getCurrentSchoolId();
  return fetchSchoolSettingsCached(schoolId);
});
