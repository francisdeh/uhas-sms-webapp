"use client";

import { BookOpen, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import type { Subject, ClassSubject, SchoolClass } from "@/features/classes/types";

interface DepartmentRow {
  schoolClass: SchoolClass;
  assignment: ClassSubject | null;
}

interface DepartmentViewProps {
  subject: Subject;
  hodName: string;
  rows: DepartmentRow[];
}

export function DepartmentView({ subject, hodName, rows }: DepartmentViewProps) {
  const totalClasses = rows.length;
  const assigned = rows.filter((r) => r.assignment?.teacherId).length;
  const unassigned = totalClasses - assigned;

  const uniqueTeachers = new Set(
    rows.map((r) => r.assignment?.teacherId).filter(Boolean)
  ).size;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">My Department</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subject.name} · JHS ·{" "}
            <span
              className={cn(
                "font-medium",
                subject.category === "Core" ? "text-blue-600" : "text-orange-500"
              )}
            >
              {subject.category}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Head of Department</p>
          <p className="text-sm font-medium">{hodName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="JHS Classes"
          value={totalClasses}
          icon={<BookOpen size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Assigned"
          value={assigned}
          icon={<CheckCircle2 size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Unassigned"
          value={unassigned}
          icon={<AlertCircle size={17} className="text-amber-500" />}
          iconBg="bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          label="Teachers"
          value={uniqueTeachers}
          icon={<Users size={17} className="text-purple-600" />}
          iconBg="bg-purple-50 dark:bg-purple-950/40"
        />
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-semibold mb-4">Class Coverage</p>
          <div>
            {rows.map(({ schoolClass, assignment }) => {
              const covered = !!assignment?.teacherId;
              return (
                <div
                  key={schoolClass.id}
                  className="flex items-center justify-between py-3 border-b border-border/40 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        covered ? "bg-green-500" : "bg-amber-400"
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">{schoolClass.name}</p>
                      <p className="text-xs text-muted-foreground">{schoolClass.academicYear}</p>
                    </div>
                  </div>

                  {covered ? (
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        firstName={assignment!.teacherName!.split(" ")[0] ?? "?"}
                        lastName={assignment!.teacherName!.split(" ").slice(1).join(" ")}
                        size="xs"
                        gradient="from-orange-400 to-orange-600"
                      />
                      <span className="text-sm">{assignment!.teacherName}</span>
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                    >
                      Unassigned
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
