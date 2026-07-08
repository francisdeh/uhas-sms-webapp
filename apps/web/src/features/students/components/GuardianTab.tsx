"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  useStudentGuardians,
  useStudentSiblings,
  useGuardianLinkMutations,
} from "@/features/students/hooks/use-student-guardians";
import { RELATION_TYPES, type RelationType } from "@/features/students/types";
import {
  GuardianField,
  emptyGuardianDraft,
  draftToPayload,
} from "./GuardianField";

const MAX_GUARDIANS = 2;

interface GuardianTabProps {
  studentId: string;
  /** Base path for sibling profile links, e.g. "/admin/students". */
  basePath: string;
}

export function GuardianTab({ studentId, basePath }: GuardianTabProps) {
  const guardians = useStudentGuardians(studentId);
  const siblings = useStudentSiblings(studentId);
  const { add, update, remove } = useGuardianLinkMutations(studentId);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyGuardianDraft(false));
  const [unlinkId, setUnlinkId] = useState<string | null>(null);

  const list = guardians.data ?? [];
  const atMax = list.length >= MAX_GUARDIANS;

  async function onAdd() {
    const payload = draftToPayload(draft);
    if (!payload) {
      toast.error(
        draft.mode === "link"
          ? "Select a guardian to link."
          : "Enter a name and at least a phone or email.",
      );
      return;
    }
    try {
      await add.mutateAsync(payload);
      setAddOpen(false);
      setDraft(emptyGuardianDraft(false));
    } catch {
      /* toast fired in the hook */
    }
  }

  return (
    <div className="space-y-6">
      {/* Guardians */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Guardians ({list.length}/{MAX_GUARDIANS})</h3>
          <Button size="sm" variant="outline" disabled={atMax} onClick={() => setAddOpen(true)}>
            <Plus size={14} className="mr-1.5" /> Add guardian
          </Button>
        </div>

        {guardians.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardian has been linked to this student.</p>
        ) : (
          list.map((g) => (
            <div key={g.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{g.name}</p>
                    {g.isPrimary && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Star size={10} className="mr-0.5" /> Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[g.phone, g.email, g.slug].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setUnlinkId(g.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={
                    RELATION_TYPES.includes(g.relationship as RelationType)
                      ? (g.relationship as RelationType)
                      : "Other"
                  }
                  onValueChange={(v) =>
                    update.mutate({ guardianId: g.id, payload: { relation: v as RelationType } })
                  }
                >
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATION_TYPES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!g.isPrimary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      update.mutate({ guardianId: g.id, payload: { isPrimary: true } })
                    }
                  >
                    Make primary
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Siblings */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Users size={14} /> Siblings
        </h3>
        {siblings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (siblings.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No siblings — students who share a guardian appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {siblings.data?.map((s) => (
              <Link
                key={s.id}
                href={`${basePath}/${s.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.className ?? "—"} · {s.slug}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add guardian</DialogTitle>
          </DialogHeader>
          <GuardianField value={draft} onChange={setDraft} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onAdd} disabled={add.isPending}>
              {add.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink confirm */}
      <AlertDialog open={unlinkId !== null} onOpenChange={(open) => !open && setUnlinkId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this guardian?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the link to the student. The guardian record itself is kept (it may
              belong to a sibling).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkId) remove.mutate(unlinkId);
                setUnlinkId(null);
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
