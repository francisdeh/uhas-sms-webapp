"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/lib/api/browser";
import type { SchoolSettings, NotificationDefaults } from "@/features/settings/types";

export function CommunicationTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [fromName, setFromName] = useState(settings.emailFromName ?? "");
  const [replyTo, setReplyTo] = useState(settings.emailReplyTo ?? "");
  const [prefs, setPrefs] = useState<NotificationDefaults>(settings.notificationDefaults);

  function togglePref(key: keyof NotificationDefaults) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function onSave() {
    setSaving(true);
    try {
      await api.school.patch({
        emailFromName: fromName || null,
        emailReplyTo: replyTo || null,
        notificationDefaults: prefs,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
      return;
    } finally {
      setSaving(false);
    }
    toast.success("Communication settings updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Communication</CardTitle>
        <CardDescription>
          Outbound email sender + the per-event notification toggles that gate whether the school
          sends an email (and, for appointments, SMS too) when something happens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="fromName">From name</FieldLabel>
              <Input
                id="fromName"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="UHAS Basic School"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="replyTo">Reply-to email</FieldLabel>
              <Input
                id="replyTo"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="info@school.edu.gh"
              />
            </Field>
          </div>

          <Separator />

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Send email when…
          </p>

          <NotifRow
            label="Lesson plan is rejected"
            description="Teacher gets the rejection note + a link to the plan."
            checked={prefs.onLessonPlanRejected}
            onToggle={() => togglePref("onLessonPlanRejected")}
          />
          <Separator />
          <NotifRow
            label="Announcement is posted"
            description="Recipients of the announcement get a copy by email."
            checked={prefs.onAnnouncementPosted}
            onToggle={() => togglePref("onAnnouncementPosted")}
          />
          <Separator />
          <NotifRow
            label="Results are published"
            description="Parents get an email when a term's results go live."
            checked={prefs.onResultsPublished}
            onToggle={() => togglePref("onResultsPublished")}
          />
          <Separator />
          <NotifRow
            label="Appointment requested or cancelled"
            description="Teacher gets an email and SMS when a parent requests or cancels a meeting."
            checked={prefs.onAppointmentActivity}
            onToggle={() => togglePref("onAppointmentActivity")}
          />
          <Separator />
          <NotifRow
            label="Appointment confirmed or declined"
            description="Parent gets an email and SMS when the teacher responds to their request."
            checked={prefs.onAppointmentDecided}
            onToggle={() => togglePref("onAppointmentDecided")}
          />
          <Separator />
          <NotifRow
            label="Leave request submitted"
            description="Admin and the relevant Deputy Head get an email and SMS when a staff member requests leave."
            checked={prefs.onLeaveActivity}
            onToggle={() => togglePref("onLeaveActivity")}
          />
          <Separator />
          <NotifRow
            label="Leave request approved or rejected"
            description="The requester gets an email and SMS when their leave request is decided."
            checked={prefs.onLeaveDecided}
            onToggle={() => togglePref("onLeaveDecided")}
          />
          <Separator />
          <NotifRow
            label="Student marked absent"
            description="The child's primary guardian gets an email and SMS the first time they're marked absent that day."
            checked={prefs.onAttendanceAbsent}
            onToggle={() => togglePref("onAttendanceAbsent")}
          />

          <div>
            <Button onClick={onSave} disabled={saving} variant="brand">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Communication
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function NotifRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}
