"use client";

import React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  User,
  ClipboardList,
  FileText,
  Bell,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { MockAnnouncement } from "@/lib/mock/announcements";

interface ChildInfo {
  id: string;
  name: string;
  classId: string;
  className: string;
  division: "KG" | "Lower Primary" | "Upper Primary" | "JHS";
}

interface Props {
  displayName: string;
  currentYear: string;
  currentTerm: number;
  linkedChildren: ChildInfo[];
  announcements: MockAnnouncement[];
  attendancePct: number | null;
}

const DIVISION_COLORS: Record<string, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-orange-700",
};

type StatCard =
  | { animated: true; value: number; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string }
  | { animated: false; value: null; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string };

export default function ParentDashboardOverview({
  displayName,
  currentYear,
  currentTerm,
  linkedChildren,
  announcements,
  attendancePct,
}: Props) {
  const classLabel =
    linkedChildren.length === 1
      ? linkedChildren[0].className
      : linkedChildren.length > 1
      ? "Multiple classes"
      : "—";

  const statCards: StatCard[] = [
    {
      animated: true,
      value: linkedChildren.length,
      label: "My Children",
      icon: User,
      iconClass: "bg-blue-50 text-blue-600",
      trend: "Enrolled this term",
      href: "/parent/children",
    },
    {
      animated: false,
      value: null,
      label: "Class",
      icon: FileText,
      iconClass: "bg-green-50 text-green-600",
      trend: classLabel,
      href: "/parent/children",
    },
    {
      animated: false,
      value: null,
      label: "Attendance",
      icon: ClipboardList,
      iconClass: "bg-purple-50 text-purple-600",
      trend: "View record",
      href: "/parent/attendance",
    },
    {
      animated: true,
      value: announcements.length,
      label: "Announcements",
      icon: Bell,
      iconClass: "bg-orange-50 text-accent-orange",
      trend: "Recent notices",
      href: "/parent/announcements",
    },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back, {displayName}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          <TrendingUp size={11} className="mr-1" /> Term {currentTerm} &middot; {currentYear}
        </Badge>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.22 }}
          >
            <Link href={card.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-5">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center mb-3",
                      card.iconClass
                    )}
                  >
                    <card.icon size={16} />
                  </div>
                  {card.animated ? (
                    <p className="text-2xl font-bold tabular-nums">
                      <AnimatedNumber value={card.value} />
                    </p>
                  ) : card.label === "Attendance" ? (
                    <p className={cn(
                      "text-2xl font-bold tabular-nums",
                      attendancePct !== null ? "text-green-600" : ""
                    )}>
                      {attendancePct !== null ? `${attendancePct}%` : "View →"}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold truncate">{card.trend}</p>
                  )}
                  <p className="text-xs font-medium mt-0.5">{card.label}</p>
                  {(card.animated || (card.label === "Attendance" && attendancePct !== null)) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {card.label === "Attendance" ? "Present rate" : card.trend}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">My Children</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {linkedChildren.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students linked to your account.</p>
              ) : (
                linkedChildren.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0"
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                        DIVISION_COLORS[child.division] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {child.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{child.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{child.id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-1.5", DIVISION_COLORS[child.division] ?? "")}
                      >
                        {child.division}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{child.className}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Announcements</CardTitle>
              <Link
                href="/parent/announcements"
                className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all <ArrowRight size={12} className="ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0"
                  >
                    <span
                      className={cn(
                        "mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                        a.isCritical ? "bg-red-400" : "bg-muted-foreground/30"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    {a.isCritical && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 shrink-0">
                        Critical
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
