import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "default" | "compact";
  className?: string;
}

// Standardised empty state used wherever a page section has no content.
// Pass `size="compact"` for in-page sub-sections (e.g. ReviewQueue "Recently reviewed")
// and the default size for full-page primary content.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const isCompact = size === "compact";

  return (
    <Card className={className}>
      <CardContent
        className={cn(
          "text-center",
          isCompact ? "py-6" : "py-12"
        )}
      >
        {Icon && (
          <div
            className={cn(
              "mx-auto rounded-full bg-muted flex items-center justify-center",
              isCompact ? "w-10 h-10 mb-3" : "w-12 h-12 mb-4"
            )}
          >
            <Icon size={isCompact ? 16 : 20} className="text-muted-foreground" />
          </div>
        )}
        <p className={cn("font-medium", isCompact ? "text-sm" : "text-sm mb-1")}>{title}</p>
        {description && (
          <p
            className={cn(
              "text-muted-foreground max-w-sm mx-auto leading-relaxed",
              isCompact ? "text-xs mt-0.5" : "text-xs"
            )}
          >
            {description}
          </p>
        )}
        {action && <div className={cn(isCompact ? "mt-3" : "mt-4")}>{action}</div>}
      </CardContent>
    </Card>
  );
}
