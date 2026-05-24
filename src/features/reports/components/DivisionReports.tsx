import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCardLite, Bar } from "./StatCardLite";
import { formatDate } from "@/lib/dates";
import type { DivisionStats } from "@/features/reports/types";

function formatDateShort(iso: string): string {
  return formatDate(iso, "EEE, d");
}

export function DivisionReports({ stats }: { stats: DivisionStats }) {
  const lpTotal =
    stats.lessonPlans.draft +
    stats.lessonPlans.submitted +
    stats.lessonPlans.approved +
    stats.lessonPlans.rejected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Division Reports — {stats.division}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Snapshot of your division&apos;s students, attendance, and academic outputs.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCardLite
          label="Students"
          value={stats.students}
          sublabel={`${stats.male} M / ${stats.female} F`}
        />
        <StatCardLite label="Classes" value={stats.classes} />
        <StatCardLite label="Staff" value={stats.staff} />
        <StatCardLite
          label="Approved plans"
          value={stats.lessonPlans.approved}
          sublabel={`${stats.lessonPlans.submitted} pending review`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Attendance — last 7 days</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          {stats.attendanceLast7.every((p) => p.total === 0) ? (
            <p className="text-sm text-muted-foreground">No attendance sessions recorded.</p>
          ) : (
            stats.attendanceLast7.map((p) => (
              <Bar
                key={p.date}
                value={p.present}
                max={p.total}
                label={formatDateShort(p.date)}
                color="bg-emerald-500"
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Lesson plans</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {lpTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No lesson plans yet.</p>
          ) : (
            <>
              <Bar value={stats.lessonPlans.draft} max={lpTotal} label="Draft" color="bg-gray-400" />
              <Bar
                value={stats.lessonPlans.submitted}
                max={lpTotal}
                label="Submitted"
                color="bg-blue-500"
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Class performance (lower aggregate = better)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {stats.topClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes in this division.</p>
          ) : (
            stats.topClasses.map((c) => (
              <div
                key={c.classId}
                className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
              >
                <span className="text-sm font-medium">{c.className}</span>
                {c.aggregateAvg == null ? (
                  <Badge variant="secondary" className="text-[10px]">No published scores</Badge>
                ) : (
                  <span className="text-sm tabular-nums font-medium">
                    Aggregate avg {c.aggregateAvg.toFixed(1)}
                  </span>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
