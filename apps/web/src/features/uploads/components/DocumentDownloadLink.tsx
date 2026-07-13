import { FileText } from "lucide-react";
import { getSignedDownloadUrl } from "@/lib/storage-admin";
import { cn } from "@/lib/utils";

type Props = {
  storagePath: string | null;
  label?: string;
  className?: string;
};

// Server component. Mints a 1-hour signed URL for the given Storage path and
// renders a download anchor. Use this anywhere a private document URL was
// previously rendered as a raw <a href={fileUrl}>.
export async function DocumentDownloadLink({ storagePath, label, className }: Props) {
  if (!storagePath) return null;

  const url = await getSignedDownloadUrl(storagePath);
  const displayLabel = label ?? storagePath.split("/").pop() ?? "Download";

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
