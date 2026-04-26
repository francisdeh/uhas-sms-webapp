"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/features/attendance/types";

interface ParentAttendanceViewProps {
  students: { id: string; name: string; classId: string; className: string }[];
  selectedStudentId: string;
  records: { date: string; status: AttendanceStatus }[];
}

const STATUS_DOT: Record<AttendanceStatus, string> = {
  present: "bg-green-500",
  absent: "bg-red-500",
  late: "bg-amber-500",
};

function buildCalendarWeeks(year: number, month: number): Date[][] {
  const weeks: Date[][] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Adjusted day-of-week: 0=Mon … 6=Sun
  const dow = (d: Date) => (d.getDay() + 6) % 7;

  const cursor = new Date(firstDay);
  cursor.setDate(cursor.getDate() - dow(firstDay));

  while (cursor <= lastDay) {
    const week: Date[] = [];
    for (let col = 0; col < 5; col++) {
      week.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 2); // skip Sat + Sun
    weeks.push(week);
  }

  return weeks;
}

export default function ParentAttendanceView({
  students,
  selectedStudentId,
  records,
}: ParentAttendanceViewProps) {
  const router = useRouter();
  const now = new Date();
  const [displayedMonth, setDisplayedMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const recordMap = new Map(records.map((r) => [r.date, r.status]));

  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const weeks = buildCalendarWeeks(displayedMonth.year, displayedMonth.month);

  const monthLabel = new Date(displayedMonth.year, displayedMonth.month, 1).toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric" }
  );

  const goToPrevMonth = () =>
    setDisplayedMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToNextMonth = () =>
    setDisplayedMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Attendance</h1>
          {students.length === 1 && selectedStudent && (
            <p className="text-sm text-muted-foreground mt-0.5">{selectedStudent.name}</p>
          )}
        </div>
        {students.length > 1 && (
          <Select
            value={selectedStudentId}
            onValueChange={(id) => router.push(`/parent/attendance?studentId=${id}`)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums text-green-600">{present}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Present{" "}
              {total > 0 && (
                <span className="text-green-600 font-medium">({pct}%)</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums text-red-600">{absent}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-600">{late}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Late</p>
          </CardContent>
        </Card>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No attendance records yet for this child.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrevMonth}
                className="p-1 rounded hover:bg-accent transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <CardTitle className="text-sm font-semibold">{monthLabel}</CardTitle>
              <button
                onClick={goToNextMonth}
                className="p-1 rounded hover:bg-accent transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-1 mb-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                <div
                  key={d}
                  className="text-center text-xs text-muted-foreground font-medium py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-5 gap-1 mb-1">
                {week.map((day, di) => {
                  const isCurrentMonth = day.getMonth() === displayedMonth.month;
                  const dateStr = day.toISOString().slice(0, 10);
                  const status = recordMap.get(dateStr);

                  return (
                    <div
                      key={di}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-md h-10",
                        isCurrentMonth ? "bg-muted/30" : "opacity-0 pointer-events-none"
                      )}
                    >
                      {isCurrentMonth && (
                        <>
                          <span className="text-xs font-medium leading-none">
                            {day.getDate()}
                          </span>
                          {status ? (
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full mt-1",
                                STATUS_DOT[status]
                              )}
                            />
                          ) : (
                            <span className="w-1.5 h-1.5 mt-1" />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40">
              {(["present", "absent", "late"] as AttendanceStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[s])} />
                  <span className="text-xs text-muted-foreground capitalize">{s}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
