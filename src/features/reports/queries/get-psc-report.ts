import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
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
  if (process.env.USE_MOCK_DATA !== "true") {
    return {
      schoolName: "UHAS Basic School",
      asOf: new Date().toISOString().slice(0, 10),
      totals: { students: 0, boys: 0, girls: 0, leavers: 0, teachers: 0, admins: 0 },
      classRows: [],
      staffByDivision: [],
    };
  }

  const active = mockStudents.filter((s) => s.isActive);
  const inactive = mockStudents.filter((s) => !s.isActive);

  const classRows: PscClassRow[] = mockClasses
    .map((c) => {
      const studs = active.filter((s) => s.classId === c.id);
      return {
        classId: c.id,
        className: c.name,
        division: c.division,
        boys: studs.filter((s) => s.gender === "Male").length,
        girls: studs.filter((s) => s.gender === "Female").length,
        total: studs.length,
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

  const staffByDivision: PscDivisionStaff[] = DIVISIONS.map((d) => ({
    division: d,
    staff: mockStaff
      .filter((s) => s.division === d && s.isActive)
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rank: s.rank,
        isUnitHead: s.isUnitHead,
      })),
  }));

  // Admins / cross-division staff
  staffByDivision.push({
    division: "Cross",
    staff: mockStaff
      .filter((s) => s.division == null && s.isActive)
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rank: s.rank,
        isUnitHead: s.isUnitHead,
      })),
  });

  const teachers = mockStaff.filter((s) => s.isActive && s.systemRole === "Teacher").length;
  const admins = mockStaff.filter((s) => s.isActive && s.systemRole === "Admin").length;

  return {
    schoolName: "UHAS Basic School",
    asOf: new Date().toISOString().slice(0, 10),
    totals: {
      students: active.length,
      boys: active.filter((s) => s.gender === "Male").length,
      girls: active.filter((s) => s.gender === "Female").length,
      leavers: inactive.length,
      teachers,
      admins,
    },
    classRows,
    staffByDivision,
  };
}
