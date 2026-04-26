"use client";

import Link from "next/link";
import { School, GraduationCap, BookOpen, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import type { SchoolClass, ClassSubject } from "@/features/classes/types";

interface TeacherClassEntry {
  schoolClass: SchoolClass;
  isClassTeacher: boolean;
  subjectsTaught: ClassSubject[];
  studentCount: number;
}

interface TeacherClassesViewProps {
  entries: TeacherClassEntry[];
}

const DIVISION_PILL: Record<string, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-orange-700",
};

export function TeacherClassesView({ entries }: TeacherClassesViewProps) {
  const classTeacherCount = entries.filter((e) => e.isClassTeacher).length;
  const subjectTeacherCount = entries.filter((e) => !e.isClassTeacher).length;
  const totalStudents = entries
    .filter((e) => e.isClassTeacher)
    .reduce((sum, e) => sum + e.studentCount, 0);
  const totalSubjects = entries.reduce((sum, e) => sum + e.subjectsTaught.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">My Classes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Classes and subjects assigned to you this term.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Class Teacher"
          value={classTeacherCount}
          icon={<School size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Subject Teacher"
          value={subjectTeacherCount}
          icon={<BookOpen size={17} className="text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Students"
          value={totalStudents}
          icon={<GraduationCap size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Subjects Taught"
          value={totalSubjects}
          icon={<ClipboardCheck size={17} className="text-purple-600" />}
          iconBg="bg-purple-50 dark:bg-purple-950/40"
        />
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No classes assigned yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(({ schoolClass, isClassTeacher, subjectsTaught, studentCount }) => (
            <Card key={schoolClass.id} className="flex flex-col">
              <CardContent className="pt-5 flex flex-col gap-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{schoolClass.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{schoolClass.academicYear}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        DIVISION_PILL[schoolClass.division]
                      )}
                    >
                      {schoolClass.division}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] px-2 py-0.5",
                        isClassTeacher
                          ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/20"
                          : "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/20"
                      )}
                    >
                      {isClassTeacher ? "Class Teacher" : "Subject Teacher"}
                    </Badge>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Subjects taught</p>
                  {subjectsTaught.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {subjectsTaught.map((cs) => (
                        <span
                          key={cs.subjectId}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {cs.subjectName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No subjects assigned</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  {isClassTeacher ? (
                    <span className="text-xs text-muted-foreground">
                      {studentCount} student{studentCount !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span />
                  )}
                  {isClassTeacher && (
                    <Link
                      href={`/teacher/attendance/${schoolClass.id}`}
                      className="text-xs font-medium text-foreground hover:underline"
                    >
                      Mark attendance →
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
