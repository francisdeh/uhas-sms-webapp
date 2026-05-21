import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import {
  findSeasonRow,
  hasPublishedTerm3EndOfTerm,
} from "@/features/promotions/lib/season-state";
import type { PromotionSeason } from "@/features/promotions/types";

export type SeasonView = {
  season: PromotionSeason | null;
  academicYear: string;
  isOpen: boolean;
  term3EndOfTermPublished: boolean;
};

export async function getCurrentSeason(): Promise<SeasonView> {
  const schoolId = await getCurrentSchoolId();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const year = school?.academicYear ?? "2025/2026";

  const [row, term3Published] = await Promise.all([
    findSeasonRow(year),
    hasPublishedTerm3EndOfTerm(year),
  ]);

  return {
    season: row
      ? {
          id: row.id,
          schoolId: row.schoolId,
          academicYear: row.academicYear,
          status: row.status as PromotionSeason["status"],
          openedWithOverride: row.openedWithOverride ?? false,
          openedById: row.openedById,
          openedByName: null,
          openedAt: row.openedAt?.toISOString() ?? null,
          closedById: row.closedById,
          closedByName: null,
          closedAt: row.closedAt?.toISOString() ?? null,
        }
      : null,
    academicYear: year,
    isOpen: row?.status === "open",
    term3EndOfTermPublished: term3Published,
  };
}
