import "server-only";
import { cache } from "react";

import { getApi } from "@/lib/api/server";
import type {
  GradingBand,
  NotificationDefaults,
  SchoolSettings,
  ScoreWeights,
} from "@/features/settings/types";

/**
 * Single-request-deduped read of the full settings shape.
 *
 * Composes two FastAPI calls:
 *   - `GET /school`        — every field on the `schools` row (settings)
 *   - `GET /school/terms`  — every term row (every academic year)
 *
 * Both are scoped to the caller's school_id via the JWT claim, so no
 * cross-school leakage is structurally possible. React's `cache()`
 * dedupes the merged result within a single Server Component render.
 *
 * Defaults below apply when the row's JSONB column is null (fresh
 * install / never-configured tenant). They mirror what the old
 * Drizzle-based getter applied.
 */

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

export const getSchoolSettings = cache(async (): Promise<SchoolSettings> => {
  const api = await getApi();
  const [school, termsResponse] = await Promise.all([
    api.school.get(),
    api.schoolTerms.list(),
  ]);

  return {
    id: school.id,
    name: school.name,
    motto: school.motto ?? null,
    address: school.address ?? null,
    phone: school.phone ?? null,
    email: school.email ?? null,
    principalName: school.principalName ?? null,
    logoUrl: school.logoUrl ?? null,
    academicYear: school.academicYear,
    currentTerm: school.currentTerm,
    terms: termsResponse.items.map((t) => ({
      id: t.id,
      academicYear: t.academicYear,
      term: t.term,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
    gradingScale: school.gradingScale ?? "GES_STANDARD",
    gradingBands: (school.gradingBands as GradingBand[] | null) ?? null,
    scoreWeights: (school.scoreWeights as ScoreWeights | null) ?? DEFAULT_SCORE_WEIGHTS,
    passMark: school.passMark ?? 40,
    emailFromName: school.emailFromName ?? null,
    emailReplyTo: school.emailReplyTo ?? null,
    notificationDefaults:
      (school.notificationDefaults as NotificationDefaults | null) ?? DEFAULT_NOTIFICATIONS,
    sessionTimeoutMinutes: school.sessionTimeoutMinutes ?? 480,
    passwordMinLength: school.passwordMinLength ?? 8,
    forcePasswordChangeOnFirstLogin: school.forcePasswordChangeOnFirstLogin ?? true,
    defaultColorScheme: school.defaultColorScheme ?? "uhas",
    sidebarAccentHex: school.sidebarAccentHex ?? null,
  };
});
