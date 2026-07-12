"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useSubjects } from "@/features/subjects/hooks/use-subjects";
import {
  useReplaceStaffSubjects,
  useStaffSubjects,
} from "@/features/staff/hooks/use-staff-profile";
import type { SubjectExpertise } from "@/features/staff/types";

interface SubjectExpertiseCardProps {
  staffId: string;
}

export function SubjectExpertiseCard({ staffId }: SubjectExpertiseCardProps) {
  const { data: allSubjects, isLoading: subjectsLoading } = useSubjects({ size: 200 });
  const { data: expertise, isLoading: expertiseLoading } = useStaffSubjects(staffId);
  const replace = useReplaceStaffSubjects(staffId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Adjust state during render (not in an effect, not via a ref) when
  // fresh data arrives — the React-recommended replacement for
  // getDerivedStateFromProps: https://react.dev/learn/you-might-not-need-an-effect
  const [syncedExpertise, setSyncedExpertise] = useState<SubjectExpertise[] | undefined>(
    undefined,
  );
  if (expertise && expertise !== syncedExpertise) {
    setSyncedExpertise(expertise);
    setSelected(new Set(expertise.map((s) => s.id)));
  }

  const currentIds = new Set((expertise ?? []).map((s) => s.id));
  const isDirty =
    selected.size !== currentIds.size || [...selected].some((id) => !currentIds.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <GraduationCap size={14} /> Subject Expertise
        </h3>
        <p className="text-xs text-muted-foreground -mt-1.5">
          Subjects this teacher is qualified to teach — separate from their current class
          assignments.
        </p>

        {subjectsLoading || expertiseLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (allSubjects?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects set up yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allSubjects?.items.map((subject) => (
              <label
                key={subject.id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(subject.id)}
                  onCheckedChange={() => toggle(subject.id)}
                />
                {subject.name}
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            disabled={!isDirty || replace.isPending}
            onClick={() => replace.mutate([...selected])}
          >
            {replace.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
