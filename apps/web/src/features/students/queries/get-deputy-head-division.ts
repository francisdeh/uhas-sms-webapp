import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import type { Division } from "@/features/auth/types";

export async function getDeputyHeadDivision(
  linkedId: string | undefined
): Promise<Division | undefined> {
  if (!linkedId) return undefined;
  const row = await db.query.staff.findFirst({ where: eq(staff.id, linkedId) });
  const d = row?.division;
  if (d === "KG" || d === "Lower Primary" || d === "Upper Primary" || d === "JHS") return d;
  return undefined;
}
