import "server-only";
import { cache } from "react";
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

// React `cache()` dedupes within a single server request. Every server
// component / action that calls this within one request gets one DB read.
export const getSchoolSettings = cache(async (): Promise<SchoolSettings> => {
  const schoolId = await getCurrentSchoolId();
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
});
