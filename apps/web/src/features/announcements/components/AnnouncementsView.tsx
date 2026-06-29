"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, AlertTriangle, Trash2, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
} from "@/features/announcements/actions";
import type { Announcement, AnnouncementAudience } from "@/features/announcements/types";
import { audienceLabel } from "@/features/announcements/types";

const schema = z.object({
  title: z.string().min(3, { message: "Title required" }),
  body: z.string().min(5, { message: "Add a body" }),
  audience: z.string().min(1, { message: "Choose an audience" }),
  isCritical: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export type AudienceOption = { value: AnnouncementAudience; label: string };

interface AnnouncementsViewProps {
  authorId: string;
  announcements: Announcement[];
  audienceOptions: AudienceOption[];
  defaultAudience: AnnouncementAudience;
  canDeleteAny?: boolean;
  classes?: { id: string; name: string }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AnnouncementsView({
  authorId,
  announcements,
  audienceOptions,
  defaultAudience,
  canDeleteAny,
  classes,
}: AnnouncementsViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { audience: defaultAudience, isCritical: false, title: "", body: "" },
  });

  function onCreate(data: FormValues) {
    startTransition(async () => {
      const result = await createAnnouncementAction({
        authorId,
        data: {
          title: data.title,
          body: data.body,
          audience: data.audience,
          isCritical: data.isCritical,
        },
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Announcement posted.");
      setCreateOpen(false);
      form.reset({ audience: defaultAudience, isCritical: false, title: "", body: "" });
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteAnnouncementAction({ id: deleteTarget.id, authorId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Announcement deleted.");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Post notices to the school, a division, or a class. Critical notices are flagged.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> New announcement
        </Button>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Post a notice for the whole school, a specific division, or a class. Flag critical ones to draw attention."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={13} className="mr-1.5" /> New announcement
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => {
            const canDelete = canDeleteAny || a.createdById === authorId;
            return (
              <Card key={a.id}>
                <CardContent className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{a.title}</p>
                      {a.isCritical && (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
                          <AlertTriangle size={10} className="mr-1" /> Critical
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {audienceLabel(a.audience, classes)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(a)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                  <p className="text-xs text-muted-foreground">By {a.createdByName}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input id="title" {...form.register("title")} />
                <FieldError errors={[form.formState.errors.title]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="body">Message</FieldLabel>
                <Textarea id="body" rows={5} {...form.register("body")} />
                <FieldError errors={[form.formState.errors.body]} />
              </Field>

              <Field>
                <FieldLabel>Audience</FieldLabel>
                <Controller
                  name="audience"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {audienceOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.audience]} />
              </Field>

              <Field>
                <FieldLabel>Critical?</FieldLabel>
                <Controller
                  name="isCritical"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "yes" : "no"}
                      onValueChange={(v) => field.onChange(v === "yes")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes — flag as critical</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Post
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
