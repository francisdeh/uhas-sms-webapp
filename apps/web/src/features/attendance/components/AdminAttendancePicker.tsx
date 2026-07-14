"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SchoolClass } from "@/features/classes/types";

interface AdminAttendancePickerProps {
  classes: SchoolClass[];
}

export function AdminAttendancePicker({ classes }: AdminAttendancePickerProps) {
  const router = useRouter();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const kgClasses = classes.filter((c) => c.division === "KG");
  const lowerPrimaryClasses = classes.filter((c) => c.division === "Lower Primary");
  const upperPrimaryClasses = classes.filter((c) => c.division === "Upper Primary");
  const jhsClasses = classes.filter((c) => c.division === "JHS");

  return (
    <div>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">View or edit any class attendance session.</p>
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              value={selectedClassId}
              onValueChange={(val) => {
                if (val) setSelectedClassId(val);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a class">
                  {(value: string) => classes.find((c) => c.id === value)?.name ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kgClasses.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>KG</SelectLabel>
                    {kgClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {lowerPrimaryClasses.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Lower Primary</SelectLabel>
                    {lowerPrimaryClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {upperPrimaryClasses.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Upper Primary</SelectLabel>
                    {upperPrimaryClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {jhsClasses.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>JHS</SelectLabel>
                    {jhsClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <Button
            className="mt-4 w-full sm:w-auto"
            disabled={!selectedClassId || !selectedDate}
            onClick={() =>
              router.push("/admin/attendance/" + selectedClassId + "?date=" + selectedDate)
            }
          >
            Open session
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
