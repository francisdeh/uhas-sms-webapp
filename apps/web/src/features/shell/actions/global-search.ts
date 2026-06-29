"use server";

import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { students, staff, classes, announcements } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";

export type GlobalSearchResults = {
  students: { id: string; name: string }[];
  staff: { id: string; name: string; email: string }[];
  classes: { id: string; name: string }[];
  announcements: { id: string; title: string }[];
};

export async function globalSearchAction(query: string): Promise<GlobalSearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { students: [], staff: [], classes: [], announcements: [] };
  }
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();
  const pattern = `%${trimmed.toLowerCase()}%`;

  const [studentRows, staffRows, classRows, announcementRows] = await Promise.all([
    db.query.students.findMany({
      where: and(
        eq(students.schoolId, schoolId),
        or(
          like(students.firstName, pattern),
          like(students.lastName, pattern),
          like(students.id, pattern)
        )
      ),
      limit: 5,
    }),
    db.query.staff.findMany({
      where: and(
        eq(staff.schoolId, schoolId),
        or(
          like(staff.firstName, pattern),
          like(staff.lastName, pattern),
          like(staff.email, pattern)
        )
      ),
      limit: 5,
    }),
    db.query.classes.findMany({
      where: and(
        eq(classes.schoolId, schoolId),
        eq(classes.academicYear, year),
        like(classes.name, pattern)
      ),
      limit: 5,
    }),
    db.query.announcements.findMany({
      where: and(eq(announcements.schoolId, schoolId), like(announcements.title, pattern)),
      limit: 4,
    }),
  ]);

  return {
    students: studentRows.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    staff: staffRows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      email: s.email ?? "",
    })),
    classes: classRows.map((c) => ({ id: c.id, name: c.name })),
    announcements: announcementRows.map((a) => ({ id: a.id, title: a.title })),
  };
}
