import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PageHeaderSkeletonProps {
  withAction?: boolean;
  withSubtitle?: boolean;
}

export function PageHeaderSkeleton({
  withAction = false,
  withSubtitle = true,
}: PageHeaderSkeletonProps) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        {withSubtitle && <Skeleton className="h-4 w-64" />}
      </div>
      {withAction && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="border-b bg-muted/30 px-4 py-3 flex gap-3 sm:gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          <div className="divide-y">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="px-4 py-4 flex gap-3 sm:gap-4 items-center">
                {Array.from({ length: columns }).map((_, c) => (
                  <Skeleton
                    key={c}
                    className={cn("h-4 flex-1", c === 0 && "max-w-[28%]")}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function FiltersBarSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full sm:w-32" />
      ))}
      <Skeleton className="h-9 w-full sm:w-48 sm:ml-auto" />
    </div>
  );
}

interface PageSkeletonProps {
  variant?: "dashboard" | "table" | "detail" | "form" | "calendar" | "list";
  withAction?: boolean;
  statCount?: number;
  rows?: number;
  columns?: number;
}

export function PageSkeleton({
  variant = "table",
  withAction = false,
  statCount = 4,
  rows = 8,
  columns = 5,
}: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <StatCardsSkeleton count={statCount} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div>
        <PageHeaderSkeleton withAction={withAction} />
        <Card className="mb-4">
          <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 w-full">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <Card>
          <CardContent className="p-6 space-y-5 max-w-2xl">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (variant === "calendar") {
    return (
      <div>
        <PageHeaderSkeleton withAction={withAction} />
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Skeleton className="h-6 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={`h-${i}`} className="h-5 sm:h-6" />
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={`d-${i}`} className="h-12 sm:h-20" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div>
        <PageHeaderSkeleton withAction={withAction} />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeaderSkeleton withAction={withAction} />
      <FiltersBarSkeleton />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}
