"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  ACADEMIC_YEARS,
  ACADEMIC_YEAR_COOKIE,
  type AcademicYear,
} from "@/lib/academic-year";

export async function setAcademicYearAction(year: string): Promise<void> {
  if (!(ACADEMIC_YEARS as readonly string[]).includes(year)) return;
  const c = await cookies();
  c.set(ACADEMIC_YEAR_COOKIE, year as AcademicYear, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
  revalidatePath("/");
}
