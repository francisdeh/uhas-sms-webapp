"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";

interface PaymentReceiptFilesProps {
  ownerId: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// Multiple receipt attachments per payment (a photo of the paper receipt,
// a MoMo SMS screenshot, etc.) — the Accountant uploads whatever proof of
// payment they already collected; the system never generates one.
export function PaymentReceiptFiles({
  ownerId,
  value,
  onChange,
  disabled,
}: PaymentReceiptFilesProps) {
  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Receipt files (optional)
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
          kind="fees/receipt"
          value={null}
          onChange={(path) => {
            if (path) onChange([...value, path]);
          }}
          label="Add a receipt file"
          accept=".pdf,.png,.jpg,.jpeg"
          maxSizeMb={5}
          hint="PDF / PNG / JPG, max 5 MB"
        />
      )}
    </div>
  );
}
