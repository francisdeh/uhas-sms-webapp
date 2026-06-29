"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadFile, buildStoragePath } from "@/lib/supabase/storage";

type Kind = "students/photo" | "staff/photo" | "school/logo";

type Props = {
  ownerId: string;
  kind: Kind;
  value: string | null;
  onChange: (publicUrl: string | null) => void;
  disabled?: boolean;
  label?: string;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploadField({
  ownerId,
  kind,
  value,
  onChange,
  disabled,
  label = "Photo",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setIsUploading(true);
    setProgress(0);
    try {
      const { bucket, path } = buildStoragePath(kind, ownerId, file);
      const { promise } = uploadFile(bucket, path, file, (p) =>
        setProgress(Math.round(p.pct * 100)),
      );
      const { publicUrl } = await promise;
      onChange(publicUrl);
      toast.success("Photo uploaded.");
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
    e.target.value = ""; // allow re-selecting the same file
  }

  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium block">
        {label}
      </label>

      <div className="flex items-center gap-3">
        <div className="h-16 w-16 rounded-full overflow-hidden bg-muted flex-shrink-0 border border-border/60 relative">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Upload size={20} />
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px] font-medium">
              <Loader2 size={14} className="animate-spin mr-1" />
              {progress}%
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            <Upload size={12} className="mr-1.5" />
            {value ? "Replace" : "Upload"}
          </Button>
          {value && !isUploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="text-rose-600 hover:text-rose-700"
            >
              <X size={12} className="mr-1.5" />
              Remove
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">PNG / JPG, max 5 MB</p>
        </div>
      </div>
    </div>
  );
}
