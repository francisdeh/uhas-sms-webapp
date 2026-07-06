import "server-only";
import { cache } from "react";

import { getApi } from "@/lib/api/server";
import type { components } from "@/types/api";
import type { SchoolSettings } from "@/features/settings/types";

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
 * install / never-configured tenant).
 */

// API-shape types — already concrete (not `Record<string, unknown>`)
// because the FastAPI side declares them as proper Pydantic sub-models.
// Aliasing them here keeps the rest of the file readable.
type ApiNotificationDefaults = NonNullable<
  components["schemas"]["SchoolRead"]["notificationDefaults"]
>;

const DEFAULT_NOTIFICATIONS: ApiNotificationDefaults = {
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
    // GET /school always resolves both to a concrete value (GES
    // defaults or a custom override) — see `SchoolsService.get_resolved`.
    // The OpenAPI type stays nullable because the underlying column is.
    gradingBands: school.gradingBands!,
    scoreWeights: school.scoreWeights!,
    passMark: school.passMark,
    emailFromName: school.emailFromName ?? null,
    emailReplyTo: school.emailReplyTo ?? null,
    notificationDefaults: school.notificationDefaults ?? DEFAULT_NOTIFICATIONS,
    passwordMinLength: school.passwordMinLength ?? 8,
    forcePasswordChangeOnFirstLogin: school.forcePasswordChangeOnFirstLogin ?? true,
    defaultColorScheme: school.defaultColorScheme ?? "uhas",
    sidebarAccentHex: school.sidebarAccentHex ?? null,
  };
});
