"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error: Error & { digest?: string };
  reset?: () => void;
  homeHref?: string;        // e.g. "/admin", "/teacher" — pass from the role boundary
  homeLabel?: string;        // e.g. "Back to dashboard"
  title?: string;
  description?: string;
  size?: "default" | "compact";
  className?: string;
}

// Standardised error UI shown by error.tsx route boundaries when a Server
// Component throws. Logs to console.error so the user can read the digest in
// dev; in production the digest is the only thing surfaced to the page.
export function ErrorState({
  error,
  reset,
  homeHref,
  homeLabel = "Back to dashboard",
  title = "Something went wrong",
  description = "An unexpected error occurred. Try again, or head back if the problem persists.",
  size = "default",
  className,
}: ErrorStateProps) {
  useEffect(() => {
    // Captures stack trace in dev; in prod only the digest is exposed.
    console.error("[error-boundary]", error);
  }, [error]);

  const isCompact = size === "compact";

  return (
    <Card className={className}>
      <CardContent className={cn("text-center", isCompact ? "py-6" : "py-12")}>
        <div
          className={cn(
            "mx-auto rounded-full bg-destructive/10 flex items-center justify-center",
            isCompact ? "w-10 h-10 mb-3" : "w-12 h-12 mb-4"
          )}
        >
          <AlertTriangle
            size={isCompact ? 16 : 20}
            className="text-destructive"
          />
        </div>
        <p className={cn("font-medium", isCompact ? "text-sm" : "text-sm mb-1")}>
          {title}
        </p>
        <p
          className={cn(
            "text-muted-foreground max-w-sm mx-auto leading-relaxed",
            isCompact ? "text-xs mt-0.5" : "text-xs"
          )}
        >
          {description}
        </p>
        {error.digest && (
          <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono">
            ref: {error.digest}
          </p>
        )}
        <div className={cn("flex justify-center gap-2", isCompact ? "mt-3" : "mt-5")}>
          {reset && (
            <Button onClick={reset} size={isCompact ? "sm" : "default"} variant="outline">
              <RotateCcw size={14} className="mr-1.5" />
              Try again
            </Button>
          )}
          {homeHref && (
            <Link href={homeHref}>
              <Button size={isCompact ? "sm" : "default"} variant="default">
                <Home size={14} className="mr-1.5" />
                {homeLabel}
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
