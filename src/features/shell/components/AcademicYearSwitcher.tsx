"use client";

import { useState, useEffect } from "react";
import { CalendarDays, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ACADEMIC_YEARS = ["2025/2026", "2024/2025", "2023/2024", "2022/2023"];
const STORAGE_KEY = "uhas_academic_year";
const DEFAULT_YEAR = "2025/2026";

export function AcademicYearSwitcher() {
  const [year, setYear] = useState(DEFAULT_YEAR);

  // Post-hydration sync: server and first client render use DEFAULT_YEAR to avoid
  // hydration mismatch; localStorage is read only after mount (intentional extra render).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && ACADEMIC_YEARS.includes(saved)) setYear(saved);
  }, []);

  function handleSelect(value: string) {
    setYear(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-border/60 bg-background text-muted-foreground text-xs hover:bg-muted/50 hover:text-foreground hover:border-border transition-all cursor-pointer sm:min-w-[148px]">
        <CalendarDays size={13} className="shrink-0 text-accent-orange" />
        <span className="hidden sm:block flex-1 text-left font-medium text-foreground">{year}</span>
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
              className={cn("cursor-pointer flex items-center justify-between", y === year && "text-accent-orange")}
            >
              <div className="flex items-center gap-2">
                <CalendarDays size={13} className={cn("shrink-0", y === year ? "text-accent-orange" : "text-muted-foreground")} />
                <span>{y}</span>
              </div>
              {y === year && <Check size={13} className="text-accent-orange" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
