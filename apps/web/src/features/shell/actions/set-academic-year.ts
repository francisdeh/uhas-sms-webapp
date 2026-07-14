"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACADEMIC_YEAR_COOKIE, isValidAcademicYear } from "@/lib/academic-year";

export async function setAcademicYearAction(year: string): Promise<void> {
  if (!isValidAcademicYear(year)) return;
  const c = await cookies();
  c.set(ACADEMIC_YEAR_COOKIE, year, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
  revalidatePath("/");
}
