import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, enrollments, staff, students } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { DIVISIONS } from "@/features/auth/types";
import type { Division } from "@/features/auth/types";

export type PscClassRow = {
  classId: string;
  className: string;
  division: Division;
  boys: number;
  girls: number;
  total: number;
};

export type PscDivisionStaff = {
  division: Division | "Cross";
  staff: { id: string; name: string; rank: string; isUnitHead: boolean }[];
};

export type PscReportData = {
  schoolName: string;
  asOf: string;
  totals: {
    students: number;
    boys: number;
    girls: number;
    leavers: number;
    teachers: number;
    admins: number;
  };
  classRows: PscClassRow[];
  staffByDivision: PscDivisionStaff[];
};

export async function getPscReportData(): Promise<PscReportData> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const activeStudents = await db.query.students.findMany({
    where: and(eq(students.schoolId, schoolId), eq(students.isActive, true)),
  });
  const inactiveStudents = await db.query.students.findMany({
    where: and(eq(students.schoolId, schoolId), eq(students.isActive, false)),
  });

  // Map studentId → classId via active enrollments for this year
  const enrollmentRows = await db
    .select({
      studentId: enrollments.studentId,
      classId: enrollments.classId,
      gender: students.gender,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.academicYear, year),
        eq(enrollments.status, "Active"),
        eq(students.isActive, true)
      )
    );

  const classRows = await db.query.classes.findMany({
    where: and(eq(classes.schoolId, schoolId), eq(classes.academicYear, year)),
    orderBy: [asc(classes.name)],
  });

  const pscClassRows: PscClassRow[] = classRows
    .map((c) => {
      const inClass = enrollmentRows.filter((e) => e.classId === c.id);
      return {
        classId: c.id,
        className: c.name,
        division: c.division as Division,
        boys: inClass.filter((s) => s.gender === "Male").length,
        girls: inClass.filter((s) => s.gender === "Female").length,
        total: inClass.length,
      };
    })
    .sort((a, b) => {
      const order: Record<Division, number> = {
        KG: 0,
        "Lower Primary": 1,
        "Upper Primary": 2,
        JHS: 3,
      };
      const da = order[a.division] - order[b.division];
      if (da !== 0) return da;
      return a.className.localeCompare(b.className);
    });

  const allStaff = await db.query.staff.findMany({
    where: and(eq(staff.schoolId, schoolId), eq(staff.isActive, true)),
  });

  const staffByDivision: PscDivisionStaff[] = DIVISIONS.map((d) => ({
    division: d,
    staff: allStaff
      .filter((s) => s.division === d)
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rank: s.rank ?? "",
        isUnitHead: s.isUnitHead ?? false,
      })),
  }));
  staffByDivision.push({
    division: "Cross",
    staff: allStaff
      .filter((s) => s.division == null)
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rank: s.rank ?? "",
        isUnitHead: s.isUnitHead ?? false,
      })),
  });

  const teachers = allStaff.filter((s) => s.systemRole === "Teacher").length;
  const admins = allStaff.filter((s) => s.systemRole === "Admin").length;

  return {
    schoolName: "UHAS Basic School",
    asOf: new Date().toISOString().slice(0, 10),
    totals: {
      students: activeStudents.length,
      boys: activeStudents.filter((s) => s.gender === "Male").length,
      girls: activeStudents.filter((s) => s.gender === "Female").length,
      leavers: inactiveStudents.length,
      teachers,
      admins,
    },
    classRows: pscClassRows,
    staffByDivision,
  };
}

