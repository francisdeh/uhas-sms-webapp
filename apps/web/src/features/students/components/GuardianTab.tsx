"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, Star, Users, KeyRound, Check, Briefcase } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
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
import { RELATION_TYPES, type RelationType, type GuardianLink } from "@/features/students/types";
import {
  GuardianField,
  emptyGuardianDraft,
  draftToPayload,
} from "./GuardianField";

const MAX_GUARDIANS = 2;

const editContactSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required" }),
  lastName: z.string().min(1, { message: "Last name is required" }),
  phone: z.string().optional(),
  email: z.string().optional(),
});

type EditContactFormValues = z.infer<typeof editContactSchema>;

/** `GuardianLink.name` is a single combined string (the list endpoint
 *  doesn't expose first/last separately) — split on the first space so
 *  the edit form can still offer independent fields. */
function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

interface GuardianTabProps {
  studentId: string;
  /** Base path for sibling profile links, e.g. "/admin/students". */
  basePath: string;
  /** Whether guardian-link mutations (add/unlink/set primary/create
   *  login) are available. Defaults `true` to preserve existing
   *  Admin/DeputyHead behavior unchanged; the read-only Teacher
   *  student profile passes `false`. */
  canEdit?: boolean;
}

export function GuardianTab({ studentId, basePath, canEdit = true }: GuardianTabProps) {
  const guardians = useStudentGuardians(studentId);
  const siblings = useStudentSiblings(studentId);
  const { add, update, remove, createLogin, editContact } = useGuardianLinkMutations(studentId);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyGuardianDraft(false));
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<GuardianLink | null>(null);

  const editForm = useForm<EditContactFormValues>({
    resolver: zodResolver(editContactSchema),
  });

  const list = guardians.data ?? [];
  const atMax = list.length >= MAX_GUARDIANS;

  function openEditDialog(g: GuardianLink) {
    editForm.reset({ ...splitName(g.name), phone: g.phone ?? "", email: g.email ?? "" });
    setEditTarget(g);
  }

  async function onEditContact(data: EditContactFormValues) {
    if (!editTarget) return;
    try {
      await editContact.mutateAsync({
        guardianId: editTarget.id,
        payload: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          email: data.email || null,
        },
      });
      setEditTarget(null);
    } catch {
      /* toast fired in the hook */
    }
  }

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
          {canEdit && (
            <Button size="sm" variant="outline" disabled={atMax} onClick={() => setAddOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Add guardian
            </Button>
          )}
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
                    {g.isStaff && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Briefcase size={10} className="mr-0.5" /> Staff
                      </Badge>
                    )}
                    {g.hasLogin ? (
                      <Badge variant="secondary" className="text-[10px]">
                        <Check size={10} className="mr-0.5" /> Has login
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        No login
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[g.phone, g.email, g.slug].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Edit contact info"
                      onClick={() => openEditDialog(g)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setUnlinkId(g.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
              {canEdit ? (
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
                  {!g.hasLogin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={createLogin.isPending}
                      onClick={() => createLogin.mutate(g.id)}
                      title={
                        g.phone || g.email
                          ? "Provision a login (phone-OTP and/or email invite)"
                          : "Add a phone or email to this guardian first"
                      }
                      className="text-brand"
                    >
                      {createLogin.isPending && createLogin.variables === g.id ? (
                        <Loader2 size={13} className="mr-1.5 animate-spin" />
                      ) : (
                        <KeyRound size={13} className="mr-1.5" />
                      )}
                      Create login
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{g.relationship}</p>
              )}
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
            <Button variant="brand" onClick={onAdd} disabled={add.isPending}>
              {add.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact info */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact info</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditContact)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="edit-guardian-first-name">First name</FieldLabel>
                <Input id="edit-guardian-first-name" {...editForm.register("firstName")} />
                <FieldError errors={[editForm.formState.errors.firstName]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-guardian-last-name">Last name</FieldLabel>
                <Input id="edit-guardian-last-name" {...editForm.register("lastName")} />
                <FieldError errors={[editForm.formState.errors.lastName]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-guardian-phone">Phone</FieldLabel>
              <Input id="edit-guardian-phone" {...editForm.register("phone")} />
              <FieldError errors={[editForm.formState.errors.phone]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-guardian-email">Email</FieldLabel>
              <Input id="edit-guardian-email" type="email" {...editForm.register("email")} />
              <FieldError errors={[editForm.formState.errors.email]} />
            </Field>

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={editContact.isPending}>
                {editContact.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
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
              variant="destructive-solid"
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
