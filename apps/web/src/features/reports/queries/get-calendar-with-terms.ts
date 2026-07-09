import { getApi } from "@/lib/api/server";
import type { CalendarEvent } from "@/features/reports/types";

/**
 * The academic calendar, merged with read-only term-boundary entries
 * derived from `school_terms` (which has no calendar_events row of its
 * own — nothing auto-syncs the two). Shared by every calendar page
 * (admin/teacher/deputy-head/parent) so they all show the same merged
 * view instead of duplicating this logic per page.
 */
export async function getCalendarWithTerms(): Promise<CalendarEvent[]> {
  const api = await getApi();
  const [calendarResp, termsResp] = await Promise.all([
    api.calendar.list({ size: 200 }),
    api.schoolTerms.list(),
  ]);

  const events: CalendarEvent[] = calendarResp.items.map((e) => ({
    id: e.id,
    schoolId: e.schoolId,
    title: e.title,
    description: e.description ?? null,
    startDate: e.startDate,
    endDate: e.endDate ?? null,
    type: e.type,
    createdById: e.createdById,
    createdAt: e.createdAt ?? new Date().toISOString(),
  }));

  const termEntries: CalendarEvent[] = termsResp.items.flatMap((t) => [
    {
      id: `term-${t.id}-start`,
      schoolId: t.schoolId,
      title: `Term ${t.term} begins (${t.academicYear})`,
      description: null,
      startDate: t.startDate,
      endDate: null,
      type: "term_start" as const,
      createdById: "",
      createdAt: t.startDate,
      isSynthetic: true,
    },
    {
      id: `term-${t.id}-end`,
      schoolId: t.schoolId,
      title: `Term ${t.term} ends (${t.academicYear})`,
      description: null,
      startDate: t.endDate,
      endDate: null,
      type: "term_end" as const,
      createdById: "",
      createdAt: t.endDate,
      isSynthetic: true,
    },
  ]);

  return [...events, ...termEntries].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
