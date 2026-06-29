import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCardLite, Bar } from "./StatCardLite";
import type { SchoolStats } from "@/features/reports/types";

export function AdminReports({ stats }: { stats: SchoolStats }) {
  const lpTotal =
    stats.lessonPlans.draft +
    stats.lessonPlans.submitted +
    stats.lessonPlans.unitHeadApproved +
    stats.lessonPlans.approved +
    stats.lessonPlans.rejected;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">School Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live snapshot of population, attendance, lesson plans, and exams.
          </p>
        </div>
        <Link href="/admin/reports/psc">
          <Button variant="outline">
            <Printer size={14} className="mr-1.5" /> PSC Report
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCardLite
          label="Active students"
          value={stats.totals.activeStudents}
          sublabel={`${stats.totals.inactiveStudents} inactive`}
        />
        <StatCardLite
          label="Active staff"
          value={stats.totals.activeStaff}
          sublabel={`${stats.totals.staff} total`}
        />
        <StatCardLite
          label="Classes"
          value={stats.totals.classes}
          sublabel={`${stats.totals.subjects} subjects`}
        />
        <StatCardLite
          label="Linked parents"
          value={stats.totals.parents}
          sublabel="Guardian accounts"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Population by division</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {stats.divisions.map((d) => {
              const colour =
                d.division === "KG"
                  ? "bg-purple-500"
                  : d.division === "Lower Primary"
                  ? "bg-sky-500"
                  : d.division === "Upper Primary"
                  ? "bg-blue-500"
                  : "bg-orange-500";
              return (
                <div key={d.division} className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="text-sm font-medium">{d.division}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {d.students} students · {d.male} M / {d.female} F · {d.classes} class
                      {d.classes === 1 ? "" : "es"} · {d.staff} staff
                    </span>
                  </div>
                  <Bar
                    value={d.students}
                    max={stats.totals.activeStudents}
                    color={colour}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Gender breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Bar
              value={stats.gender.male}
              max={stats.totals.activeStudents}
              label="Boys"
              color="bg-blue-500"
            />
            <Bar
              value={stats.gender.female}
              max={stats.totals.activeStudents}
              label="Girls"
              color="bg-pink-500"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Lesson plans — workflow</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Bar value={stats.lessonPlans.draft} max={lpTotal} label="Draft" color="bg-gray-400" />
            <Bar
              value={stats.lessonPlans.submitted}
              max={lpTotal}
              label="Submitted (Unit Head)"
              color="bg-blue-500"
            />
            <Bar
              value={stats.lessonPlans.unitHeadApproved}
              max={lpTotal}
              label="Unit-Head approved (Deputy Head)"
              color="bg-amber-500"
            />
            <Bar
              value={stats.lessonPlans.approved}
              max={lpTotal}
              label="Approved"
              color="bg-green-500"
            />
            <Bar
              value={stats.lessonPlans.rejected}
              max={lpTotal}
              label="Rejected"
              color="bg-red-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Exams</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">Configured exams</span>
              <span className="tabular-nums font-medium">{stats.exams.total}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">Published</span>
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                {stats.exams.published}
              </Badge>
            </div>
            <div className="pt-2 border-t border-border/60">
              <Link
                href="/admin/examinations"
                className="inline-flex items-center text-xs text-blue-600 hover:underline"
              >
                <FileText size={11} className="mr-1" /> Manage exams
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Today&apos;s attendance</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Bar
            value={stats.todayAttendance.sessionsRecorded}
            max={stats.todayAttendance.classes}
            label="Classes recorded"
            color="bg-emerald-500"
          />
        </CardContent>
      </Card>
    </div>
  );
}
