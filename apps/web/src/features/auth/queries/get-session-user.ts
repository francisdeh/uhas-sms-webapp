import type { SessionUser } from "@/features/auth/types";
import { ApiError } from "@/lib/api/client";
import { getApi } from "@/lib/api/server";

/**
 * Resolve the current Server Component's user via the FastAPI `/me`
 * endpoint. One round-trip replaces the legacy Drizzle join across
 * `users`, `staff`, and `guardians`.
 *
 * Returns null on:
 *   - no session (401 from /me)
 *   - session but role/school claim missing (403 from /me)
 *   - transport / decode error
 *
 * `linkedId` on the wire is `string | null`; the SessionUser type keeps
 * it as `string` with empty-string sentinel for the "no linked row"
 * branch, matching every caller's existing narrowing.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const api = await getApi();
    const me = await api.me.get();
    return {
      uid: me.uid,
      email: me.email,
      displayName: me.displayName,
      role: me.role,
      linkedId: me.linkedId ?? "",
      slug: me.slug ?? null,
      phone: me.phone ?? null,
      mustChangePassword: me.mustChangePassword,
      isUnitHead: me.isUnitHead,
      unitHeadOf: me.unitHeadOf ?? null,
      emailOnLessonPlanRejected: me.emailOnLessonPlanRejected,
      emailOnResultsPublished: me.emailOnResultsPublished,
      emailOnAppointmentActivity: me.emailOnAppointmentActivity,
      smsOnAppointmentActivity: me.smsOnAppointmentActivity,
      emailOnAppointmentDecided: me.emailOnAppointmentDecided,
      smsOnAppointmentDecided: me.smsOnAppointmentDecided,
      emailOnLeaveActivity: me.emailOnLeaveActivity,
      smsOnLeaveActivity: me.smsOnLeaveActivity,
      emailOnLeaveDecided: me.emailOnLeaveDecided,
      smsOnLeaveDecided: me.smsOnLeaveDecided,
      emailOnAttendanceAbsent: me.emailOnAttendanceAbsent,
      smsOnAttendanceAbsent: me.smsOnAttendanceAbsent,
      emailOnAssignmentCreated: me.emailOnAssignmentCreated,
      smsOnAssignmentCreated: me.smsOnAssignmentCreated,
      emailOnSchemeActivity: me.emailOnSchemeActivity,
      smsOnSchemeActivity: me.smsOnSchemeActivity,
      emailOnSchemeDecided: me.emailOnSchemeDecided,
      smsOnSchemeDecided: me.smsOnSchemeDecided,
      emailOnPromotionSeason: me.emailOnPromotionSeason,
      smsOnPromotionSeason: me.smsOnPromotionSeason,
      emailOnPromotionActivity: me.emailOnPromotionActivity,
      smsOnPromotionActivity: me.smsOnPromotionActivity,
      emailOnPromotionDecided: me.emailOnPromotionDecided,
      smsOnPromotionDecided: me.smsOnPromotionDecided,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}
