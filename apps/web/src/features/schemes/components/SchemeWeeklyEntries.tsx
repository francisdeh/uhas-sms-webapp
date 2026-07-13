"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import {
  useAddSchemeEntry,
  useUpdateSchemeEntry,
  useRemoveSchemeEntry,
} from "@/features/schemes/hooks/use-schemes";
import type { SchemeWeeklyEntry } from "@/features/schemes/types";
import { SchemeResourceFiles } from "./SchemeResourceFiles";

const entrySchema = z.object({
  week: z.number().int().min(1, { message: "Week is required" }).max(20),
  strand: z.string().optional(),
  subStrand: z.string().optional(),
  contentStandard: z.string().optional(),
  indicators: z.string().optional(),
  resources: z.string().optional(),
});

type EntryFormValues = z.infer<typeof entrySchema>;

function emptyValues(week: number): EntryFormValues {
  return {
    week,
    strand: "",
    subStrand: "",
    contentStandard: "",
    indicators: "",
    resources: "",
  };
}

interface SchemeWeeklyEntriesProps {
  schemeId: string;
  entries: SchemeWeeklyEntry[];
  canEdit: boolean;
}

export function SchemeWeeklyEntries({ schemeId, entries, canEdit }: SchemeWeeklyEntriesProps) {
  const addEntry = useAddSchemeEntry();
  const updateEntry = useUpdateSchemeEntry();
  const removeEntry = useRemoveSchemeEntry();
  const isPending = addEntry.isPending || updateEntry.isPending || removeEntry.isPending;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchemeWeeklyEntry | null>(null);
  const [resourceFiles, setResourceFiles] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SchemeWeeklyEntry | null>(null);

  const nextWeek = entries.reduce((max, e) => Math.max(max, e.week), 0) + 1;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: emptyValues(nextWeek),
  });

  function openAdd() {
    setEditing(null);
    setResourceFiles([]);
    form.reset(emptyValues(nextWeek));
    setDialogOpen(true);
  }

  function openEdit(entry: SchemeWeeklyEntry) {
    setEditing(entry);
    setResourceFiles(entry.resourceFileUrls);
    form.reset({
      week: entry.week,
      strand: entry.strand ?? "",
      subStrand: entry.subStrand ?? "",
      contentStandard: entry.contentStandard ?? "",
      indicators: entry.indicators ?? "",
      resources: entry.resources ?? "",
    });
    setDialogOpen(true);
  }

  function cloneLastWeek() {
    if (!lastEntry) return;
    form.setValue("strand", lastEntry.strand ?? "");
    form.setValue("subStrand", lastEntry.subStrand ?? "");
    form.setValue("contentStandard", lastEntry.contentStandard ?? "");
    form.setValue("indicators", lastEntry.indicators ?? "");
  }

  async function onSave(values: EntryFormValues) {
    const payload = {
      week: values.week,
      strand: values.strand || null,
      subStrand: values.subStrand || null,
      contentStandard: values.contentStandard || null,
      indicators: values.indicators || null,
      resources: values.resources || null,
      resourceFileUrls: resourceFiles,
    };
    try {
      if (editing) {
        await updateEntry.mutateAsync({ id: schemeId, entryId: editing.id, payload });
      } else {
        await addEntry.mutateAsync({ id: schemeId, payload });
      }
      setDialogOpen(false);
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    try {
      await removeEntry.mutateAsync({ id: schemeId, entryId: deleteTarget.id });
      setDeleteTarget(null);
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Weekly entries ({entries.length})</p>
        {canEdit && (
          <Button type="button" size="sm" variant="brand" onClick={openAdd}>
            <Plus size={13} className="mr-1.5" /> Add week
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No weeks added yet — add each week&apos;s Strand, Sub-strand, Content Standard,
          Indicators, and Resources as you plan the term.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Badge variant="secondary" className="text-[10px]">
                      Week {entry.week}
                    </Badge>
                    {entry.strand && <p className="text-sm font-medium">{entry.strand}</p>}
                    {entry.subStrand && (
                      <p className="text-xs text-muted-foreground">{entry.subStrand}</p>
                    )}
                    {entry.contentStandard && (
                      <p className="text-xs">
                        <span className="font-medium">Content Standard:</span>{" "}
                        {entry.contentStandard}
                      </p>
                    )}
                    {entry.indicators && (
                      <p className="text-xs">
                        <span className="font-medium">Indicators:</span> {entry.indicators}
                      </p>
                    )}
                    {entry.resources && (
                      <p className="text-xs">
                        <span className="font-medium">Resources:</span> {entry.resources}
                      </p>
                    )}
                    {entry.resourceFileUrls.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {entry.resourceFileUrls.length} file
                        {entry.resourceFileUrls.length === 1 ? "" : "s"} attached
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => setDeleteTarget(entry)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit week ${editing.week}` : "Add a week"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSave)}>
            <FieldGroup className="gap-4">
              <div className="flex items-center justify-between">
                <Field className="max-w-[140px]">
                  <FieldLabel htmlFor="week">Week</FieldLabel>
                  <Input
                    id="week"
                    type="number"
                    min={1}
                    {...form.register("week", { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.week]} />
                </Field>
                {!editing && lastEntry && (
                  <Button type="button" variant="ghost" size="sm" onClick={cloneLastWeek}>
                    <Copy size={12} className="mr-1.5" /> Clone last week
                  </Button>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="strand">Strand</FieldLabel>
                <Input id="strand" {...form.register("strand")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="subStrand">Sub-strand</FieldLabel>
                <Input id="subStrand" {...form.register("subStrand")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="contentStandard">Content Standard</FieldLabel>
                <Textarea id="contentStandard" rows={2} {...form.register("contentStandard")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="indicators">Indicators</FieldLabel>
                <Textarea id="indicators" rows={2} {...form.register("indicators")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="resources">Resources</FieldLabel>
                <Textarea id="resources" rows={2} {...form.register("resources")} />
              </Field>

              <SchemeResourceFiles
                ownerId={schemeId}
                value={resourceFiles}
                onChange={setResourceFiles}
              />
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" variant="brand" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                {editing ? "Save changes" : "Add week"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove week {deleteTarget?.week}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={onDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
