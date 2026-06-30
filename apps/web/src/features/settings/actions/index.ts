"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";

import { db } from "@/db";
import { schoolTerms } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { applySchoolSettingsPatch } from "./_helpers";
import { SCHOOL_SETTINGS_TAG } from "@/features/settings/queries/get-school-settings";
import type { ActionResult } from "@/features/settings/types";

// ─── Calendar tab — TODO: port to FastAPI alongside school_terms ─────────────
//
// Identity, Grading, Communication, Security, and Branding tabs were
// rewired to FastAPI's `PATCH /school` endpoint (Phase 2.1). Calendar
// stays on this Server Action because the `school_terms` sub-resource
// is deferred to a follow-up port — once `apps/api/app/features/school_terms/`
// exists, this action goes too.

const calendarSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, { message: "Use YYYY/YYYY format." }),
  currentTerm: z.number().int().min(1).max(3),
  terms: z
    .array(
      z.object({
        term: z.number().int().min(1).max(3),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Use YYYY-MM-DD." }),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .length(3, { message: "Three terms required." }),
});

export async function updateCalendarAction(
  input: z.input<typeof calendarSchema>
): Promise<ActionResult> {
  const parsed = calendarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const p = parsed.data;

  for (const t of p.terms) {
    if (t.endDate < t.startDate) {
      return { success: false, error: `Term ${t.term}: end date is before start date.` };
    }
  }

  const settingsResult = await applySchoolSettingsPatch({
    academicYear: p.academicYear,
    currentTerm: p.currentTerm,
  });
  if (!settingsResult.success) return settingsResult;

  const schoolId = await getCurrentSchoolId();
  for (const t of p.terms) {
    const existing = await db.query.schoolTerms.findFirst({
      where: and(
        eq(schoolTerms.schoolId, schoolId),
        eq(schoolTerms.academicYear, p.academicYear),
        eq(schoolTerms.term, t.term)
      ),
    });
    if (existing) {
      await db
        .update(schoolTerms)
        .set({ startDate: t.startDate, endDate: t.endDate })
        .where(eq(schoolTerms.id, existing.id));
    } else {
      await db.insert(schoolTerms).values({
        schoolId,
        academicYear: p.academicYear,
        term: t.term,
        startDate: t.startDate,
        endDate: t.endDate,
      });
    }
  }
  updateTag(SCHOOL_SETTINGS_TAG);
  revalidatePath("/admin/settings");
  return { success: true };
}
