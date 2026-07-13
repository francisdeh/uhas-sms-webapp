"use client";

import { useState } from "react";
import { HeartPulse, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useStudentMedical,
  useUpdateStudentMedical,
} from "@/features/students/hooks/use-student-guardians";
import { BLOOD_TYPES, type BloodType, type MedicalUpdateInput } from "@/features/students/types";

interface MedicalInfoCardProps {
  studentId: string;
  /** Admin, or the student's own parent — matches the backend gate on
   *  `PATCH /students/{id}/medical`. Everyone else (Deputy, Teacher)
   *  sees this card read-only. */
  canEdit: boolean;
}

export function MedicalInfoCard({ studentId, canEdit }: MedicalInfoCardProps) {
  const { data, isLoading } = useStudentMedical(studentId);
  const update = useUpdateStudentMedical(studentId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MedicalUpdateInput>({});

  function startEditing() {
    setDraft(data ?? {});
    setEditing(true);
  }

  async function onSave() {
    try {
      await update.mutateAsync(draft);
      setEditing(false);
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <HeartPulse size={14} /> Medical Info
          </h3>
          {canEdit && !editing && (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Pencil size={12} className="mr-1.5" /> Edit
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : editing ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Blood type</Label>
              <Select
                value={draft.bloodType ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, bloodType: v as BloodType }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select blood type" />
                </SelectTrigger>
                <SelectContent>
                  {BLOOD_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {bt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Allergies / conditions</Label>
              <Textarea
                rows={3}
                value={draft.medicalNotes ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, medicalNotes: e.target.value }))}
                placeholder="e.g. Peanut allergy, asthma…"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Emergency contact name</Label>
                <Input
                  value={draft.emergencyContactName ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, emergencyContactName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Emergency contact phone</Label>
                <Input
                  value={draft.emergencyContactPhone ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, emergencyContactPhone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(data ?? {});
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="brand" size="sm" onClick={onSave} disabled={update.isPending}>
                {update.isPending && <Loader2 size={12} className="mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Blood type</p>
              <p className="font-medium">{data?.bloodType ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Emergency contact</p>
              <p className="font-medium">
                {data?.emergencyContactName
                  ? `${data.emergencyContactName}${data.emergencyContactPhone ? ` · ${data.emergencyContactPhone}` : ""}`
                  : "—"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Allergies / conditions</p>
              <p className="font-medium whitespace-pre-wrap">{data?.medicalNotes ?? "—"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
