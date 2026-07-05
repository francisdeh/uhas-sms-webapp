import Link from "next/link";
import { SearchX, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotFoundStateProps {
  homeHref?: string;
  homeLabel?: string;
  title?: string;
  description?: string;
  className?: string;
}

// Standardised 404 UI shown by not-found.tsx route boundaries — the
// counterpart to ErrorState for "nothing thrown, route just doesn't exist".
export function NotFoundState({
  homeHref = "/",
  homeLabel = "Go home",
  title = "Page not found",
  description = "The page you're looking for doesn't exist or may have moved.",
  className,
}: NotFoundStateProps) {
  return (
    <Card className={className}>
      <CardContent className={cn("text-center py-12")}>
        <div className="mx-auto rounded-full bg-muted flex items-center justify-center w-12 h-12 mb-4">
          <SearchX size={20} className="text-muted-foreground" />
        </div>
        <p className="font-medium text-sm mb-1">{title}</p>
        <p className="text-muted-foreground max-w-sm mx-auto leading-relaxed text-xs">
          {description}
        </p>
        <div className="flex justify-center gap-2 mt-5">
          <Link href={homeHref}>
            <Button variant="default">
              <Home size={14} className="mr-1.5" />
              {homeLabel}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
