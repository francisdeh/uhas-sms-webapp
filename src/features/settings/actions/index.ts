"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { schoolTerms } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { applySchoolSettingsPatch } from "./_helpers";
import type { ActionResult } from "@/features/settings/types";

// ─── Identity tab ────────────────────────────────────────────────────────────

const identitySchema = z.object({
  name: z.string().min(2, { message: "School name is required." }),
  motto: z.string().max(255).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.email({ message: "Enter a valid email." }).max(255).optional().or(z.literal("")),
  principalName: z.string().max(255).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
});

export async function updateIdentityAction(
  input: z.input<typeof identitySchema>
): Promise<ActionResult> {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const p = parsed.data;
  return applySchoolSettingsPatch({
    name: p.name,
    motto: p.motto ?? null,
    address: p.address ?? null,
    phone: p.phone ?? null,
    email: p.email && p.email.length > 0 ? p.email : null,
    principalName: p.principalName ?? null,
    logoUrl: p.logoUrl ?? null,
  });
}

// ─── Calendar tab ────────────────────────────────────────────────────────────

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
    const id = `term-${p.academicYear.replace("/", "-")}-${t.term}`;
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
        id,
        schoolId,
        academicYear: p.academicYear,
        term: t.term,
        startDate: t.startDate,
        endDate: t.endDate,
      });
    }
  }
  revalidatePath("/admin/settings");
  return { success: true };
}

// ─── Grading tab ─────────────────────────────────────────────────────────────

const gradingBandSchema = z.object({
  min: z.number().int().min(0).max(100),
  max: z.number().int().min(0).max(100),
  grade: z.string().min(1).max(10),
  interpretation: z.string().min(1).max(50),
});

const gradingSchema = z.object({
  gradingScale: z.enum(["GES_STANDARD", "CUSTOM"]),
  gradingBands: z.array(gradingBandSchema).optional().nullable(),
  scoreWeights: z.object({
    exam: z.number().int().min(0).max(100),
    cat1: z.number().int().min(0).max(100),
    cat2: z.number().int().min(0).max(100),
    groupWork: z.number().int().min(0).max(100),
    projectWork: z.number().int().min(0).max(100),
  }),
  passMark: z.number().int().min(0).max(100),
});

export async function updateGradingAction(
  input: z.input<typeof gradingSchema>
): Promise<ActionResult> {
  const parsed = gradingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const p = parsed.data;
  const sum =
    p.scoreWeights.exam +
    p.scoreWeights.cat1 +
    p.scoreWeights.cat2 +
    p.scoreWeights.groupWork +
    p.scoreWeights.projectWork;
  if (sum !== 100) {
    return { success: false, error: `Score weights must sum to 100 (currently ${sum}).` };
  }

  return applySchoolSettingsPatch({
    gradingScale: p.gradingScale,
    gradingBands: p.gradingScale === "CUSTOM" ? (p.gradingBands ?? null) : null,
    scoreWeights: p.scoreWeights,
    passMark: p.passMark,
  });
}

// ─── Communication tab ───────────────────────────────────────────────────────

const communicationSchema = z.object({
  emailFromName: z.string().max(255).optional().nullable(),
  emailReplyTo: z.email().max(255).optional().or(z.literal("")),
  notificationDefaults: z.object({
    onLessonPlanRejected: z.boolean(),
    onAnnouncementPosted: z.boolean(),
    onResultsPublished: z.boolean(),
  }),
});

export async function updateCommunicationAction(
  input: z.input<typeof communicationSchema>
): Promise<ActionResult> {
  const parsed = communicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const p = parsed.data;
  return applySchoolSettingsPatch({
    emailFromName: p.emailFromName ?? null,
    emailReplyTo: p.emailReplyTo && p.emailReplyTo.length > 0 ? p.emailReplyTo : null,
    notificationDefaults: p.notificationDefaults,
  });
}

// ─── Security tab ────────────────────────────────────────────────────────────

const securitySchema = z.object({
  sessionTimeoutMinutes: z.number().int().min(15).max(1440),
  passwordMinLength: z.number().int().min(6).max(64),
  forcePasswordChangeOnFirstLogin: z.boolean(),
});

export async function updateSecurityAction(
  input: z.input<typeof securitySchema>
): Promise<ActionResult> {
  const parsed = securitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return applySchoolSettingsPatch(parsed.data);
}

// ─── Branding tab ────────────────────────────────────────────────────────────

const brandingSchema = z.object({
  defaultColorScheme: z.enum(["default", "uhas"]),
  sidebarAccentHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "Use a 6-digit hex like #F97316." })
    .optional()
    .or(z.literal("")),
});

export async function updateBrandingAction(
  input: z.input<typeof brandingSchema>
): Promise<ActionResult> {
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const p = parsed.data;
  return applySchoolSettingsPatch({
    defaultColorScheme: p.defaultColorScheme,
    sidebarAccentHex: p.sidebarAccentHex && p.sidebarAccentHex.length > 0 ? p.sidebarAccentHex : null,
  });
}
