import { cn } from "@/lib/utils";

export function StatCardLite({
  label,
  value,
  sublabel,
  className,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}

export function Bar({
  value,
  max,
  label,
  color = "bg-blue-500",
}: {
  value: number;
  max: number;
  label?: string;
  color?: string;
}) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}
          {max > 0 && <> / {max}</>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
