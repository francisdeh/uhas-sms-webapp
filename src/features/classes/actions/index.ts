"use server";

import { mockClasses } from "@/lib/mock/classes";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockClassSubjects } from "@/lib/mock/class-subjects";
import { mockStaff } from "@/lib/mock/staff";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  SchoolClass,
  Subject,
  ClassSubject,
  Division,
  CreateClassInput,
  CreateSubjectInput,
  AssignTeacherInput,
  AddClassSubjectInput,
} from "@/features/classes/types";

type ActionResult = { success: true } | { success: false; error: string };

const DIVISION_WEIGHT: Record<Division, number> = {
  KG: 0,
  "Lower Primary": 1,
  "Upper Primary": 2,
  JHS: 3,
};

export async function listClassesAction(
  division?: Division,
  academicYear?: string
): Promise<SchoolClass[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    // Default to the user's currently-selected academic year when not specified.
    const year = academicYear ?? (await getCurrentAcademicYear());

    let results = [...mockClasses];

    if (division !== undefined) {
      results = results.filter((c) => c.division === division);
    }

    results = results.filter((c) => c.academicYear === year);

    return results.sort((a, b) => {
      const divDiff = DIVISION_WEIGHT[a.division] - DIVISION_WEIGHT[b.division];
      if (divDiff !== 0) return divDiff;
      return a.name.localeCompare(b.name);
    });
  }

  return [];
}

export async function createClassAction(
  input: CreateClassInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA === "true") {
    const duplicate = mockClasses.find(
      (c) =>
        c.name === input.name && c.academicYear === input.academicYear
    );

    if (duplicate) {
      return {
        success: false,
        error: "A class with this name already exists for this academic year.",
      };
    }

    const id = `class-${input.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    mockClasses.push({
      id,
      schoolId: "school-uhas-001",
      name: input.name,
      division: input.division,
      academicYear: input.academicYear,
      classTeachers: [],
    });

    return { success: true, id };
  }

  return { success: false, error: "Not implemented." };
}

export async function listSubjectsAction(
  division?: Division | null
): Promise<Subject[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    let results: Subject[];

    if (division !== undefined) {
      results = mockSubjects.filter(
        (s) => s.division === division || s.division === null
      );
    } else {
      results = [...mockSubjects];
    }

    return results.sort((a, b) => {
      const aWeight = a.division !== null ? DIVISION_WEIGHT[a.division] : 4;
      const bWeight = b.division !== null ? DIVISION_WEIGHT[b.division] : 4;

      const divDiff = aWeight - bWeight;
      if (divDiff !== 0) return divDiff;
      return a.name.localeCompare(b.name);
    });
  }

  return [];
}

export async function createSubjectAction(
  input: CreateSubjectInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA === "true") {
    const duplicate = mockSubjects.find(
      (s) => s.name === input.name && s.division === input.division
    );

    if (duplicate) {
      return {
        success: false,
        error: "A subject with this name already exists for this division.",
      };
    }

    const id = `sub-${Date.now()}`;

    mockSubjects.push({
      id,
      schoolId: "school-uhas-001",
      name: input.name,
      division: input.division,
      category: input.category,
    });

    return { success: true, id };
  }

  return { success: false, error: "Not implemented." };
}

export async function listClassSubjectsAction(
  classId: string
): Promise<ClassSubject[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockClassSubjects
      .filter((cs) => cs.classId === classId)
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }

  return [];
}

export async function listClassSubjectsBySubjectAction(
  subjectId: string
): Promise<ClassSubject[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockClassSubjects.filter((cs) => cs.subjectId === subjectId);
  }
  return [];
}

export async function listClassSubjectsByTeacherAction(
  teacherId: string
): Promise<ClassSubject[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockClassSubjects.filter((cs) => cs.teacherId === teacherId);
  }
  return [];
}

export async function addClassSubjectAction(
  classId: string,
  input: AddClassSubjectInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const existing = mockClassSubjects.find(
      (cs) => cs.classId === classId && cs.subjectId === input.subjectId
    );

    if (existing) {
      return { success: false, error: "Subject already linked to this class." };
    }

    const subject = mockSubjects.find((s) => s.id === input.subjectId);

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    mockClassSubjects.push({
      classId,
      subjectId: input.subjectId,
      subjectName: subject.name,
      teacherId: null,
      teacherName: null,
    });

    return { success: true };
  }

  return { success: false, error: "Not implemented." };
}

export async function assignTeacherAction(
  classId: string,
  subjectId: string,
  input: AssignTeacherInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const record = mockClassSubjects.find(
      (cs) => cs.classId === classId && cs.subjectId === subjectId
    );

    if (!record) {
      return { success: false, error: "Assignment not found." };
    }

    if (input.teacherId === null) {
      record.teacherId = null;
      record.teacherName = null;
    } else {
      const staff = mockStaff.find((s) => s.id === input.teacherId);

      if (!staff) {
        return { success: false, error: "Teacher not found." };
      }

      record.teacherId = staff.id;
      record.teacherName = `${staff.firstName} ${staff.lastName}`;
    }

    return { success: true };
  }

  return { success: false, error: "Not implemented." };
}

export async function assignClassTeacherAction(
  classId: string,
  input: { teacherId: string | null }
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const schoolClass = mockClasses.find((c) => c.id === classId);

    if (!schoolClass) {
      return { success: false, error: "Class not found." };
    }

    if (input.teacherId === null) {
      schoolClass.classTeachers = [];
    } else {
      const staff = mockStaff.find((s) => s.id === input.teacherId);

      if (!staff) {
        return { success: false, error: "Teacher not found." };
      }

      schoolClass.classTeachers = [
        {
          staffId: staff.id,
          staffName: `${staff.firstName} ${staff.lastName}`,
          isPrimary: true,
        },
      ];
    }

    return { success: true };
  }

  return { success: false, error: "Not implemented." };
}

export async function addClassTeacherAction(
  classId: string,
  input: { staffId: string; isPrimary?: boolean }
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const schoolClass = mockClasses.find((c) => c.id === classId);
    if (!schoolClass) return { success: false, error: "Class not found." };

    if (schoolClass.classTeachers.some((t) => t.staffId === input.staffId)) {
      return { success: false, error: "Staff already a class teacher for this class." };
    }

    const staff = mockStaff.find((s) => s.id === input.staffId);
    if (!staff) return { success: false, error: "Teacher not found." };

    if (input.isPrimary) {
      schoolClass.classTeachers = schoolClass.classTeachers.map((t) => ({ ...t, isPrimary: false }));
    }

    schoolClass.classTeachers.push({
      staffId: staff.id,
      staffName: `${staff.firstName} ${staff.lastName}`,
      isPrimary: input.isPrimary ?? schoolClass.classTeachers.length === 0,
    });

    return { success: true };
  }

  return { success: false, error: "Not implemented." };
}

export async function removeClassTeacherAction(
  classId: string,
  staffId: string
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const schoolClass = mockClasses.find((c) => c.id === classId);
    if (!schoolClass) return { success: false, error: "Class not found." };

    schoolClass.classTeachers = schoolClass.classTeachers.filter((t) => t.staffId !== staffId);

    if (schoolClass.classTeachers.length > 0 && !schoolClass.classTeachers.some((t) => t.isPrimary)) {
      schoolClass.classTeachers[0].isPrimary = true;
    }

    return { success: true };
  }

  return { success: false, error: "Not implemented." };
}
