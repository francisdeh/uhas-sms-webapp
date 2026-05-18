"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, X, Calendar, Inbox, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { respondToAppointmentAction } from "@/features/appointments/actions";
import type { Appointment } from "@/features/appointments/types";
import { SLOT_LABELS } from "@/features/appointments/types";
import { AppointmentStatusPill } from "./AppointmentStatusPill";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TeacherAppointmentsInbox({
  teacherId,
  appointments,
}: {
  teacherId: string;
  appointments: Appointment[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [declineTarget, setDeclineTarget] = useState<Appointment | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = appointments.filter((a) => a.status === "pending");
  const others = appointments.filter((a) => a.status !== "pending");

  function handleConfirm(appt: Appointment) {
    setActingId(appt.id);
    startTransition(async () => {
      const result = await respondToAppointmentAction({
        id: appt.id,
        teacherId,
        decision: { decision: "confirm", response: responses[appt.id] },
      });
      setActingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Confirmed.");
      router.refresh();
    });
  }

  function handleDecline() {
    if (!declineTarget) return;
    if (!responses[declineTarget.id]?.trim()) {
      toast.error("Add a reason when declining.");
      return;
    }
    setActingId(declineTarget.id);
    startTransition(async () => {
      const result = await respondToAppointmentAction({
        id: declineTarget.id,
        teacherId,
        decision: { decision: "decline", response: responses[declineTarget.id] },
      });
      setActingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Declined.");
      setDeclineTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Parent Appointments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Parents&apos; requests to meet about their children.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Inbox}
            title="No pending requests"
            description="When parents book a meeting with you, the requests show up here."
          />
        ) : (
          pending.map((appt) => {
            const isOpen = openId === appt.id;
            return (
              <Card key={appt.id}>
                <CardContent className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : appt.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{appt.guardianName}</p>
                          <Badge variant="secondary" className="text-[10px]">re: {appt.studentName}</Badge>
                          <AppointmentStatusPill status={appt.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Calendar size={11} className="inline mr-1" />
                          {formatDate(appt.preferredDate)} · {SLOT_LABELS[appt.preferredSlot]}
                        </p>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                      {appt.reason && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Parent&apos;s reason</p>
                          <p className="text-sm whitespace-pre-wrap">{appt.reason}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Your response (optional for confirm, required for decline)
                        </p>
                        <Textarea
                          rows={2}
                          placeholder="e.g. Confirmed for 3:30pm in the staff common room."
                          value={responses[appt.id] ?? ""}
                          onChange={(e) =>
                            setResponses((prev) => ({ ...prev, [appt.id]: e.target.value }))
                          }
                          className="resize-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeclineTarget(appt)}
                          disabled={isPending}
                        >
                          <X size={13} className="mr-1.5" /> Decline
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirm(appt)}
                          disabled={isPending && actingId === appt.id}
                        >
                          {isPending && actingId === appt.id ? (
                            <Loader2 size={13} className="animate-spin mr-1.5" />
                          ) : (
                            <Check size={13} className="mr-1.5" />
                          )}
                          Confirm
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recent ({others.length})</h2>
        {others.length === 0 ? (
          <EmptyState
            size="compact"
            icon={History}
            title="No past requests"
            description="Confirmed, declined, or cancelled appointments will show up here."
          />
        ) : (
          others.map((appt) => (
            <Card key={appt.id}>
              <CardContent className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{appt.guardianName}</p>
                    <Badge variant="secondary" className="text-[10px]">re: {appt.studentName}</Badge>
                    <AppointmentStatusPill status={appt.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(appt.preferredDate)}
                  </span>
                </div>
                {appt.teacherResponse && (
                  <p className="text-xs text-muted-foreground">
                    Your note: {appt.teacherResponse}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <AlertDialog open={!!declineTarget} onOpenChange={(open) => { if (!open) setDeclineTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              The parent will see your reason. They can rebook for a different time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDecline}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
