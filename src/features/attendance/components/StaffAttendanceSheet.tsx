"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { formatDateLong } from "@/lib/dates";

import { saveStaffSessionAction } from "@/features/attendance/actions";
import type { StaffAttendanceStatus, StaffSessionWithRecords } from "@/features/attendance/types";
import type { Staff } from "@/features/staff/types";

interface StaffAttendanceSheetProps {
  session: StaffSessionWithRecords | null;
  division: "KG" | "Lower Primary" | "Upper Primary" | "JHS";
  date: string;
  term: number;
  staff: Staff[];
  approvedLeaveStaffIds: Set<string>;
  submittedById: string;
  editable: boolean;
}

type RowState = { status: StaffAttendanceStatus; note: string; expanded: boolean };

function buildInitialRows(
  staff: Staff[],
  session: StaffSessionWithRecords | null,
  approvedLeaveStaffIds: Set<string>
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const s of staff) {
    const record = session?.records.find((r) => r.staffId === s.id);
    let status: StaffAttendanceStatus;
    if (record) {
      status = record.status;
    } else if (approvedLeaveStaffIds.has(s.id)) {
      status = "on_leave";
    } else {
      status = "present";
    }
    rows[s.id] = {
      status,
      note: record?.note ?? "",
      expanded: false,
    };
  }
  return rows;
}

function avatarGradient(role: Staff["systemRole"]): string {
  if (role === "Admin") return "from-gray-400 to-gray-600";
  if (role === "DeputyHead") return "from-purple-400 to-purple-600";
  return "from-green-400 to-green-600";
}

const STAFF_STATUS_LABELS: { value: StaffAttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
];

function statusActiveClass(status: StaffAttendanceStatus): string {
  if (status === "present") return "bg-green-100 text-green-700 border-green-300 hover:bg-green-100";
  if (status === "absent") return "bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600";
  return "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-100";
}

export function StaffAttendanceSheet({
  session,
  division,
  date,
  term,
  staff,
  approvedLeaveStaffIds,
  submittedById,
  editable,
}: StaffAttendanceSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    buildInitialRows(staff, session, approvedLeaveStaffIds)
  );

  function setStatus(staffId: string, status: StaffAttendanceStatus) {
    setRows((prev) => ({
      ...prev,
      [staffId]: { ...prev[staffId], status },
    }));
  }

  function updateNote(staffId: string, note: string) {
    setRows((prev) => ({
      ...prev,
      [staffId]: { ...prev[staffId], note },
    }));
  }

  function toggleExpanded(staffId: string) {
    setRows((prev) => ({
      ...prev,
      [staffId]: { ...prev[staffId], expanded: !prev[staffId].expanded },
    }));
  }

  function markAllPresent() {
    // Keep approved-leave staff on their leave status — only flip the rest.
    const next: Record<string, RowState> = {};
    for (const s of staff) {
      const wasOnLeave = approvedLeaveStaffIds.has(s.id);
      next[s.id] = {
        ...(rows[s.id] ?? { note: "", expanded: false }),
        status: wasOnLeave ? "on_leave" : "present",
      };
    }
    setRows(next);

    startTransition(async () => {
      const records = staff.map((s) => ({
        staffId: s.id,
        status: next[s.id].status,
        note: next[s.id].note || undefined,
      }));
      const result = await saveStaffSessionAction({
        division,
        date,
        term,
        submittedById,
        records,
      });
      if (result.success) {
        const presentCount = records.filter((r) => r.status === "present").length;
        const leaveCount = records.filter((r) => r.status === "on_leave").length;
        toast.success(
          leaveCount > 0
            ? `${presentCount} marked present · ${leaveCount} kept on leave.`
            : `All ${presentCount} staff marked present.`
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSave() {
    startTransition(async () => {
      const records = staff.map((s) => ({
        staffId: s.id,
        status: rows[s.id].status,
        note: rows[s.id].note || undefined,
      }));

      const result = await saveStaffSessionAction({
        division,
        date,
        term,
        submittedById,
        records,
      });

      if (result.success) {
        toast.success("Attendance saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const formattedDate = formatDateLong(date);

  const presentCount = staff.filter((s) => rows[s.id]?.status === "present").length;
  const absentCount = staff.filter((s) => rows[s.id]?.status === "absent").length;
  const onLeaveCount = staff.filter((s) => rows[s.id]?.status === "on_leave").length;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Date:</label>
          <input
            type="date"
            defaultValue={date}
            onChange={(e) => router.push("?date=" + e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{division}</h1>
            <p className="text-sm text-muted-foreground">{formattedDate}</p>
          </div>
          <Badge variant="secondary">Term {term}</Badge>
        </div>

        {!editable && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
            <AlertDescription>This session is read-only.</AlertDescription>
          </Alert>
        )}

        {editable && staff.length > 0 && (
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
          {staff.map((s) => {
            const row = rows[s.id];
            if (!row) return null;

            return (
              <div key={s.id}>
                <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
                  <div className="flex-1 flex items-center gap-3">
                    <UserAvatar
                      photoUrl={s.photoUrl}
                      firstName={s.firstName}
                      lastName={s.lastName}
                      size="sm"
                      gradient={avatarGradient(s.systemRole)}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="hidden sm:block text-xs text-muted-foreground">{s.rank}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {STAFF_STATUS_LABELS.map(({ value, label }) => (
                      <Button
                        key={value}
                        variant="outline"
                        size="sm"
                        disabled={!editable}
                        onClick={() => setStatus(s.id, value)}
                        className={cn(
                          "px-2 sm:px-3",
                          row.status === value && statusActiveClass(value)
                        )}
                      >
                        <span className="hidden sm:inline">{label}</span>
                        <span className="sm:hidden">{label[0]}</span>
                      </Button>
                    ))}

                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(s.id)}
                        className="px-1"
                      >
                        {row.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    )}
                  </div>
                </div>

                {row.expanded && editable && (
                  <div className="pb-3 pl-12">
                    <Input
                      placeholder="Add a note (optional)"
                      value={row.note}
                      onChange={(e) => updateNote(s.id, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editable && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {presentCount} present · {absentCount} absent · {onLeaveCount} on leave
            </p>
            <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
              {isPending && <Loader2 className="animate-spin" size={14} />}
              Save session
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
