"use client";

import React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  GraduationCap,
  School,
  ClipboardCheck,
  BookOpen,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { SchoolClass } from "@/features/classes/types";

interface Props {
  displayName: string;
  currentYear: string;
  currentTerm: number;
  stats: { students: number; classes: number };
  myClasses: SchoolClass[];
  studentCountByClass: Record<string, number>;
  todayAttendance: { submitted: number; total: number };
}

type StatCard =
  | { animated: true; value: number; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string }
  | { animated: false; value: null; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string };

const DIVISION_COLORS: Record<string, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-orange-700",
};

export default function TeacherDashboardOverview({
  displayName,
  currentYear,
  currentTerm,
  stats,
  myClasses,
  studentCountByClass,
  todayAttendance,
}: Props) {
  const statCards: StatCard[] = [
    {
      animated: true,
      value: stats.students,
      label: "My Students",
      icon: GraduationCap,
      iconClass: "bg-blue-50 text-blue-600",
      trend: "Across all classes",
      href: "/teacher/classes",
    },
    {
      animated: true,
      value: stats.classes,
      label: "My Classes",
      icon: School,
      iconClass: "bg-green-50 text-green-600",
      trend: "Assigned this term",
      href: "/teacher/attendance",
    },
    {
      animated: false,
      value: null,
      label: "Attendance",
      icon: ClipboardCheck,
      iconClass: "bg-purple-50 text-purple-600",
      trend: "classes marked today",
      href: "/teacher/attendance",
    },
    {
      animated: false,
      value: null,
      label: "Lesson Plans",
      icon: BookOpen,
      iconClass: "bg-orange-50 text-accent-orange",
      trend: "Create & submit",
      href: "/teacher/lesson-plans",
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
          <p className="text-sm text-muted-foreground mt-0.5">{displayName}</p>
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
                      todayAttendance.total > 0 && todayAttendance.submitted === todayAttendance.total
                        ? "text-green-600"
                        : todayAttendance.submitted > 0
                        ? "text-amber-600"
                        : ""
                    )}>
                      {todayAttendance.submitted}/{todayAttendance.total}
                    </p>
                  ) : (
                    <p className="text-lg font-bold">My Plans →</p>
                  )}
                  <p className="text-xs font-medium mt-0.5">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.trend}</p>
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
              <CardTitle className="text-sm font-semibold">My Classes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {myClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have no assigned classes.</p>
              ) : (
                myClasses.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/teacher/attendance/${cls.id}`}
                    className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/30 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cls.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-1.5", DIVISION_COLORS[cls.division] ?? "")}
                      >
                        {cls.division}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {studentCountByClass[cls.id] ?? 0} students
                    </span>
                  </Link>
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {[
                { label: "Attendance", href: "/teacher/attendance" },
                { label: "My Classes", href: "/teacher/classes" },
                { label: "Lesson Plans", href: "/teacher/lesson-plans" },
                { label: "Examinations", href: "/teacher/examinations" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  {link.label}
                  <ArrowRight
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
