"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Check, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setAcademicYearAction } from "@/features/shell/actions/set-academic-year";
import { ACADEMIC_YEARS } from "@/lib/academic-year";
import { cn } from "@/lib/utils";

export function AcademicYearSwitcher({ currentYear }: { currentYear: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(value: string) {
    if (value === currentYear) return;
    startTransition(async () => {
      await setAcademicYearAction(value);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-border/60 bg-background text-muted-foreground text-xs hover:bg-muted/50 hover:text-foreground hover:border-border transition-all cursor-pointer sm:min-w-[148px]"
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 size={13} className="shrink-0 text-accent-orange animate-spin" />
        ) : (
          <CalendarDays size={13} className="shrink-0 text-accent-orange" />
        )}
        <span className="hidden sm:block flex-1 text-left font-medium text-foreground">{currentYear}</span>
        <ChevronDown size={11} className="hidden sm:block shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground pb-1">
            Academic Year
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {ACADEMIC_YEARS.map((y) => (
            <DropdownMenuItem
              key={y}
              onClick={() => handleSelect(y)}
              className={cn(
                "cursor-pointer flex items-center justify-between",
                y === currentYear && "text-accent-orange"
              )}
            >
              <div className="flex items-center gap-2">
                <CalendarDays
                  size={13}
                  className={cn("shrink-0", y === currentYear ? "text-accent-orange" : "text-muted-foreground")}
                />
                <span>{y}</span>
              </div>
              {y === currentYear && <Check size={13} className="text-accent-orange" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
