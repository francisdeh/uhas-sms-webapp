"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadFile, buildStoragePath } from "@/lib/supabase/storage";

type Kind = "lesson-plans/file" | "schemes/file" | "assignments/file";

type Props = {
  ownerId: string;
  kind: Kind;
  value: string | null; // stored Storage path (not a URL)
  onChange: (storagePath: string | null) => void;
  disabled?: boolean;
  label?: string;
  accept?: string;
};

const MAX_BYTES = 20 * 1024 * 1024;
// Must match the `documents` bucket's `allowed_mime_types` in
// supabase/config.toml — anything else passes this client-side picker
// but gets rejected by Supabase Storage after the upload starts.
const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function FileUploadField({
  ownerId,
  kind,
  value,
  onChange,
  disabled,
  label = "Attachment",
  accept = DEFAULT_ACCEPT,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [originalName, setOriginalName] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("File must be under 20 MB.");
      return;
    }
    setIsUploading(true);
    setProgress(0);
    setOriginalName(file.name);
    try {
      const { bucket, path } = buildStoragePath(kind, ownerId, file);
      const { promise } = uploadFile(bucket, path, file, (p) =>
        setProgress(Math.round(p.pct * 100)),
      );
      const result = await promise;
      onChange(result.path);
      toast.success("File uploaded.");
    } catch (err: unknown) {
      console.error(err);
      toast.error((err as { message?: string }).message ?? "Upload failed.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  const displayName = originalName ?? (value ? basename(value) : null);

  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium block">
        {label}
      </label>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate">{displayName}</span>
          </div>
          {isUploading ? (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> {progress}%
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="h-7 px-2 text-rose-600 hover:text-rose-700"
            >
              <X size={12} />
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={onSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
            className="w-full justify-start"
          >
            {isUploading ? (
              <>
                <Loader2 size={12} className="mr-1.5 animate-spin" />
                Uploading {progress}%
              </>
            ) : (
              <>
                <Upload size={12} className="mr-1.5" />
                Upload file
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            PDF / DOC / XLS, max 20 MB
          </p>
        </div>
      )}
    </div>
  );
}
