"use client";

import { useState } from "react";
import { Award, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import {
  useStaffQualificationMutations,
  useStaffQualifications,
} from "@/features/staff/hooks/use-staff-profile";

interface QualificationsCardProps {
  staffId: string;
  /** Admin-only mutation (`POST/DELETE /staff/{id}/qualifications`
   *  requires Admin) — defaults `true` to preserve existing behavior;
   *  the read-only Deputy Head staff profile passes `false`. */
  canManage?: boolean;
}

export function QualificationsCard({ staffId, canManage = true }: QualificationsCardProps) {
  const { data, isLoading } = useStaffQualifications(staffId);
  const { add, remove } = useStaffQualificationMutations(staffId);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [yearObtained, setYearObtained] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);

  const qualifications = data ?? [];

  async function onAdd() {
    if (!name.trim()) return;
    try {
      await add.mutateAsync({
        name: name.trim(),
        institution: institution.trim() || undefined,
        yearObtained: yearObtained ? Number(yearObtained) : undefined,
      });
      setName("");
      setInstitution("");
      setYearObtained("");
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Award size={14} /> Qualifications
        </h3>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : qualifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No qualifications on file yet.</p>
        ) : (
          <div className="space-y-2">
            {qualifications.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{q.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[q.institution, q.yearObtained].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-rose-600 hover:text-rose-700 flex-shrink-0"
                    onClick={() => setRemoveId(q.id)}
                  >
                    <X size={13} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label className="text-xs">Add a qualification</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="e.g. B.Ed Mathematics"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:col-span-1"
              />
              <Input
                placeholder="Institution (optional)"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
              <Input
                placeholder="Year (optional)"
                type="number"
                value={yearObtained}
                onChange={(e) => setYearObtained(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="brand" size="sm" disabled={!name.trim() || add.isPending} onClick={onAdd}>
                Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this qualification?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              disabled={remove.isPending}
              onClick={async () => {
                if (!removeId) return;
                try {
                  await remove.mutateAsync(removeId);
                  setRemoveId(null);
                } catch {
                  /* toast fired inside the hook */
                }
              }}
            >
              <Trash2 size={13} className="mr-1.5" /> Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
