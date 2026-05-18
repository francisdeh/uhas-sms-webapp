"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceSession } from "@/features/attendance/types";

interface SessionHistoryProps {
  sessions: AttendanceSession[];
  basePath: string;
}

export function SessionHistory({ sessions, basePath }: SessionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Past Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <History size={16} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No past sessions recorded</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto leading-relaxed">
              Daily attendance for this class will appear here once you start marking sessions.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">Date</th>
                <th className="text-left pb-2 font-medium">Term</th>
                <th className="text-right pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5">
                    {new Date(session.date + "T00:00:00").toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2.5 text-muted-foreground">Term {session.term}</td>
                  <td className="py-2.5 text-right">
                    <Link
                      href={basePath + "?date=" + session.date}
                      className="text-primary text-xs hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
