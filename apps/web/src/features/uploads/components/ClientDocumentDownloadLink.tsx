"use client";

import { useState, useTransition } from "react";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { signDocumentUrlAction } from "@/features/uploads/actions/sign-document";
import { cn } from "@/lib/utils";

type Props = {
  storagePath: string | null;
  label?: string;
  className?: string;
};

// Drop-in replacement for `<a href={fileUrl}>` in client components.
// Mints a signed URL via server action on click, then opens it in a new tab.
export function ClientDocumentDownloadLink({ storagePath, label, className }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  if (!storagePath) return null;
  const displayLabel = label ?? storagePath.split("/").pop() ?? "Download";

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (cachedUrl) {
      window.open(cachedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    startTransition(async () => {
      const url = await signDocumentUrlAction(storagePath!);
      if (!url) {
        toast.error("Couldn't generate a download link.");
        return;
      }
      setCachedUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-blue-600 hover:underline",
        className
      )}
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
      {displayLabel}
    </a>
  );
}
