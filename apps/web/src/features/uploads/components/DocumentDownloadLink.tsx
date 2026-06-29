import { FileText, Download } from "lucide-react";
import { getSignedDownloadUrl } from "@/lib/storage-admin";
import { cn } from "@/lib/utils";

type Props = {
  storagePath: string | null;
  label?: string;
  variant?: "button" | "inline";
  className?: string;
};

// Server component. Mints a 1-hour signed URL for the given Storage path and
// renders a download anchor. Use this anywhere a private document URL was
// previously rendered as a raw <a href={fileUrl}>.
export async function DocumentDownloadLink({
  storagePath,
  label,
  variant = "button",
  className,
}: Props) {
  if (!storagePath) return null;

  const url = await getSignedDownloadUrl(storagePath);
  const displayLabel = label ?? storagePath.split("/").pop() ?? "Download";

  if (variant === "inline") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 text-sm text-blue-600 hover:underline",
          className
        )}
      >
        <FileText size={12} />
        {displayLabel}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors",
        className
      )}
    >
      <Download size={12} />
      {displayLabel}
    </a>
  );
}
