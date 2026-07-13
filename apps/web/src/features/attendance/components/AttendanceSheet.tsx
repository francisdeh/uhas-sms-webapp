"use client";

import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useUpsertAttendanceSession } from "@/features/attendance/hooks/use-attendance";
import { formatDateLong } from "@/lib/dates";
import type {
  AttendanceStatus,
  SessionWithRecords,
} from "@/features/attendance/types";
import type { Student } from "@/features/students/types";
import type { components } from "@/types/api";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CheckCheck } from "lucide-react";

/** API status inferred from the actual record shape — no separate
 * Literal is emitted in OpenAPI, so we read it off the record. */
type ApiStatus = components["schemas"]["AttendanceRecordInput"]["status"];
const UI_TO_API_STATUS: Record<AttendanceStatus, ApiStatus> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
};

interface AttendanceSheetProps {
  classId: string;
  className: string;
  date: string;
  term: number;
  students: Student[];
  existingSession: SessionWithRecords | null;
  editable: boolean;
  submittedById: string;
}

type RowState = {
  status: AttendanceStatus;
  lateReason: string;
  note: string;
  expanded: boolean;
};

function buildInitialRows(
  students: Student[],
  existingSession: SessionWithRecords | null
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const student of students) {
    const record = existingSession?.records.find((r) => r.studentId === student.id);
    rows[student.id] = {
      status: record?.status ?? "present",
      lateReason: record?.lateReason ?? "",
      note: record?.note ?? "",
      expanded: false,
    };
  }
  return rows;
}

function avatarGradient(division: Student["division"]): string {
  if (division === "KG") return "from-purple-400 to-purple-600";
  if (division === "Lower Primary") return "from-sky-400 to-sky-600";
  if (division === "Upper Primary") return "from-blue-400 to-blue-600";
  return "from-orange-400 to-orange-600";
}

const STATUS_LABELS: AttendanceStatus[] = ["present", "absent", "late"];

function statusActiveClass(status: AttendanceStatus): string {
  if (status === "present") return "bg-green-100 text-green-700 border-green-300 hover:bg-green-100";
  if (status === "absent") return "bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600";
  return "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100";
}

export function AttendanceSheet({
  classId,
  className,
  date,
  term,
  students,
  existingSession,
  editable,
  submittedById,
}: AttendanceSheetProps) {
  const upsert = useUpsertAttendanceSession();
  const isPending = upsert.isPending;
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    buildInitialRows(students, existingSession)
  );

  // Stable callbacks so the memoized row only re-renders when its own
  // row state actually changes.
  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        // auto-open the reason input when marking late
        expanded: status === "late" ? true : prev[studentId].expanded,
        // clear lateReason if no longer late
        lateReason: status === "late" ? prev[studentId].lateReason : "",
      },
    }));
  }, []);

  const updateLateReason = useCallback((studentId: string, lateReason: string) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], lateReason },
    }));
  }, []);

  const updateNote = useCallback((studentId: string, note: string) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], note },
    }));
  }, []);

  const toggleExpanded = useCallback((studentId: string) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], expanded: !prev[studentId].expanded },
    }));
  }, []);

  function markAllPresent() {
    const next: Record<string, RowState> = {};
    for (const s of students) {
      next[s.id] = {
        ...(rows[s.id] ?? { note: "", expanded: false }),
        status: "present",
        lateReason: "",
      };
    }
    setRows(next);

    upsert.mutate({
      classId,
      date,
      term,
      records: students.map((s) => ({
        studentId: s.id,
        status: "Present" as ApiStatus,
        note: next[s.id].note || undefined,
      })),
    });
    // `submittedById` is now derived server-side from the caller's JWT —
    // the frontend no longer sends it. Kept in the prop signature to
    // avoid churn in the pages that render this sheet.
    void submittedById;
  }

  function handleSave() {
    const missingReasons = students.filter(
      (s) => rows[s.id].status === "late" && !rows[s.id].lateReason.trim()
    );
    if (missingReasons.length > 0) {
      toast.error(
        `Add a reason for ${missingReasons.length} late student${missingReasons.length === 1 ? "" : "s"}.`
      );
      return;
    }

    upsert.mutate({
      classId,
      date,
      term,
      records: students.map((s) => ({
        studentId: s.id,
        status: UI_TO_API_STATUS[rows[s.id].status],
        lateReason:
          rows[s.id].status === "late" ? rows[s.id].lateReason : undefined,
        note: rows[s.id].note || undefined,
      })),
    });
  }

  const formattedDate = formatDateLong(date);

  const presentCount = students.filter((s) => rows[s.id]?.status === "present").length;
  const absentCount = students.filter((s) => rows[s.id]?.status === "absent").length;
  const lateCount = students.filter((s) => rows[s.id]?.status === "late").length;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">{formattedDate}</p>
            <p className="font-bold text-lg">{className}</p>
          </div>
          <Badge variant="secondary">Term {term}</Badge>
        </div>

        {!editable && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
            <AlertDescription>
              This session is read-only. Only today&apos;s session can be edited.
            </AlertDescription>
          </Alert>
        )}

        {editable && students.length > 0 && (
          <div className="mb-3 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={markAllPresent}
              disabled={isPending}
              className="text-xs"
            >
              {isPending ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <CheckCheck size={13} className="mr-1.5" />
              )}
              Mark all present
            </Button>
          </div>
        )}

        <div>
          {students.map((student) => {
            const row = rows[student.id];
            if (!row) return null;
            return (
              <AttendanceRow
                key={student.id}
                student={student}
                row={row}
                editable={editable}
                onSetStatus={setStatus}
                onToggleExpanded={toggleExpanded}
                onUpdateLateReason={updateLateReason}
                onUpdateNote={updateNote}
              />
            );
          })}
        </div>

        {editable && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {presentCount} present · {absentCount} absent · {lateCount} late
            </p>
            <Button
              variant="brand"
              onClick={handleSave}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending && <Loader2 className="animate-spin" size={14} />}
              Save session
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AttendanceRowProps {
  student: Student;
  row: RowState;
  editable: boolean;
  onSetStatus: (studentId: string, status: AttendanceStatus) => void;
  onToggleExpanded: (studentId: string) => void;
  onUpdateLateReason: (studentId: string, lateReason: string) => void;
  onUpdateNote: (studentId: string, note: string) => void;
}

// Memoized so a single row only re-renders when its own row state or the
// editable flag changes, not on every parent state update. At 350 students,
// avoiding 349 wasted renders per cell change makes the sheet feel instant.
const AttendanceRow = memo(function AttendanceRow({
  student,
  row,
  editable,
  onSetStatus,
  onToggleExpanded,
  onUpdateLateReason,
  onUpdateNote,
}: AttendanceRowProps) {
  return (
    <div>
      <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
        <div className="flex-1 flex items-center gap-3">
          <UserAvatar
            photoUrl={student.photoUrl}
            firstName={student.firstName}
            lastName={student.lastName}
            size="sm"
            gradient={avatarGradient(student.division)}
          />
          <div>
            <p className="text-sm font-medium">
              {student.firstName} {student.lastName}
            </p>
            <p className="hidden sm:block text-xs text-muted-foreground font-mono">{student.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {STATUS_LABELS.map((status) => (
            <Button
              key={status}
              variant="outline"
              size="sm"
              disabled={!editable}
              onClick={() => onSetStatus(student.id, status)}
              className={cn(
                "capitalize px-2 sm:px-3",
                row.status === status && statusActiveClass(status)
              )}
            >
              <span className="hidden sm:inline">{status}</span>
              <span className="sm:hidden">{status[0].toUpperCase()}</span>
            </Button>
          ))}

          {editable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpanded(student.id)}
              className="px-1"
            >
              {row.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Button>
          )}
        </div>
      </div>

      {row.expanded && editable && (
        <div className="pb-3 pl-12 space-y-2">
          {row.status === "late" && (
            <div>
              <Input
                placeholder="Reason for lateness (required)"
                value={row.lateReason}
                onChange={(e) => onUpdateLateReason(student.id, e.target.value)}
                className={cn(
                  "h-8 text-sm",
                  !row.lateReason.trim() && "border-amber-300 focus-visible:ring-amber-300"
                )}
              />
            </div>
          )}
          <Input
            placeholder="Add a note (optional)"
            value={row.note}
            onChange={(e) => onUpdateNote(student.id, e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      )}
    </div>
  );
});
