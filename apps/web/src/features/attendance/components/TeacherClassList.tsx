"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
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
  if (division === "Lower Primary") return "bg-sky-100 text-sky-700";
  if (division === "Upper Primary") return "bg-blue-100 text-blue-700";
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
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <ClipboardCheck size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">No classes assigned</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              You aren&apos;t listed as a class teacher for any class this academic year. Admin or your Deputy Head can assign you to one from the Classes page.
            </p>
          </CardContent>
        </Card>
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
