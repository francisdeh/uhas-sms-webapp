"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SchoolClass, Division } from "@/features/classes/types";

interface TeacherClassListProps {
  classes: SchoolClass[];
  todaySessions: Record<string, boolean>;
  listHref: string;
}

function divisionBadgeClass(division: Division): string {
  if (division === "KG") return "bg-purple-100 text-purple-700";
  if (division === "Primary") return "bg-blue-100 text-blue-700";
  return "bg-orange-100 text-orange-700";
}

export function TeacherClassList({ classes, todaySessions, listHref }: TeacherClassListProps) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>

      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-6">You have no assigned classes.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {classes.map((cls) => (
            <Link key={cls.id} href={listHref + "/" + cls.id}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5 flex flex-col gap-2">
                  <p className="text-base font-semibold">{cls.name}</p>
                  <Badge
                    variant="secondary"
                    className={cn(divisionBadgeClass(cls.division))}
                  >
                    {cls.division}
                  </Badge>
                  {todaySessions[cls.id] ? (
                    <Badge className="bg-green-100 text-green-700 border-green-300 w-fit">
                      Submitted
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300 w-fit">
                      Not yet marked
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
