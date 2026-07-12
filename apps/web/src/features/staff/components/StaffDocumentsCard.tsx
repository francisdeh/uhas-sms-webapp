"use client";

import { useState } from "react";
import { FileStack, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import {
  useStaffDocumentMutations,
  useStaffDocuments,
} from "@/features/staff/hooks/use-staff-profile";
import { STAFF_DOCUMENT_LABELS, type StaffDocumentLabel } from "@/features/staff/types";

interface StaffDocumentsCardProps {
  staffId: string;
  /** Admin only, per the backend gate on POST/DELETE — a staff member
   *  can view/download their own but not manage them. */
  canManage: boolean;
}

export function StaffDocumentsCard({ staffId, canManage }: StaffDocumentsCardProps) {
  const { data, isLoading } = useStaffDocuments(staffId);
  const { add, remove } = useStaffDocumentMutations(staffId);
  const [label, setLabel] = useState<StaffDocumentLabel | "">("");
  const [otherLabel, setOtherLabel] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function onUpload(path: string | null) {
    if (!path || !label) return;
    try {
      await add.mutateAsync({
        label,
        otherLabel: label === "Other" ? otherLabel || undefined : undefined,
        storagePath: path,
      });
      setLabel("");
      setOtherLabel("");
    } catch {
      /* toast fired inside the hook */
    }
  }

  const docs = data ?? [];

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <FileStack size={14} /> Documents
        </h3>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {doc.label === "Other" ? doc.otherLabel || "Other" : doc.label}
                  </p>
                  <p className="text-xs text-muted-foreground">Uploaded by {doc.uploadedByName}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <ClientDocumentDownloadLink storagePath={doc.storagePath} variant="inline" />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 text-rose-600 hover:text-rose-700"
                      onClick={() => setRemoveId(doc.id)}
                    >
                      <X size={13} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label className="text-xs">Add a document</Label>
            <Select value={label} onValueChange={(v) => setLabel(v as StaffDocumentLabel)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Document type" />
              </SelectTrigger>
              <SelectContent>
                {STAFF_DOCUMENT_LABELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {label === "Other" && (
              <Input
                placeholder="Describe the document"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
              />
            )}
            <FileUploadField
              ownerId={staffId}
              kind="staff/document"
              value={null}
              onChange={onUpload}
              label="Upload file"
              disabled={!label || (label === "Other" && !otherLabel)}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              hint="PDF, DOC, or image, max 20 MB"
            />
          </div>
        )}
      </CardContent>

      <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
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
