"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";

interface LeaveDocumentFilesProps {
  ownerId: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// Supporting documents (e.g. a doctor's note) attached at creation
// time — always optional. Mirrors SchemeResourceFiles' controlled
// string[] pattern; 5 MB cap since these are typically phone photos
// of a paper note, not large documents.
export function LeaveDocumentFiles({
  ownerId,
  value,
  onChange,
  disabled,
}: LeaveDocumentFilesProps) {
  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Supporting documents (optional)
      </Label>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((path, i) => (
            <li
              key={path}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5"
            >
              <ClientDocumentDownloadLink storagePath={path} />
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-red-600 flex-shrink-0"
                  onClick={() => removeAt(i)}
                >
                  <X size={12} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <FileUploadField
          ownerId={ownerId}
          kind="leave/document"
          value={null}
          onChange={(path) => {
            if (path) onChange([...value, path]);
          }}
          label="Add a document"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          maxSizeMb={5}
          hint="PDF, DOC, or image, max 5 MB"
        />
      )}
    </div>
  );
}
