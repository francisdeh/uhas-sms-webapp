"use client";

import React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  GraduationCap,
  Users,
  School,
  ClipboardCheck,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { Staff } from "@/features/staff/types";

interface Props {
  division: "KG" | "Lower Primary" | "Upper Primary" | "JHS";
  displayName: string;
  currentYear: string;
  currentTerm: number;
  stats: { students: number; staff: number; classes: number };
  staffList: Staff[];
  staffAttendanceToday: boolean;
}

const roleColors: Record<string, string> = {
  Admin: "bg-gray-100 text-gray-700 border-gray-200",
  DeputyHead: "bg-purple-100 text-purple-700 border-purple-200",
  Teacher: "bg-green-100 text-green-700 border-green-200",
};

type StatCard =
  | { animated: true; value: number; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string }
  | { animated: false; value: null; label: string; icon: React.ElementType; iconClass: string; trend: string; href: string };

export default function DeputyHeadDashboardOverview({
  division,
  displayName,
  currentYear,
  currentTerm,
  stats,
  staffList,
  staffAttendanceToday,
}: Props) {
  const statCards: StatCard[] = [
    {
      label: "Division Students",
      value: stats.students,
      icon: GraduationCap,
      iconClass: "bg-blue-50 text-blue-600",
      trend: `${division} division`,
      href: "/deputy-head/students",
      animated: true,
    },
    {
      label: "Division Staff",
      value: stats.staff,
      icon: Users,
      iconClass: "bg-orange-50 text-accent-orange",
      trend: "Active members",
      href: "/deputy-head/attendance",
      animated: true,
    },
    {
      label: "Classes",
      value: stats.classes,
      icon: School,
      iconClass: "bg-green-50 text-green-600",
      trend: `${division} division`,
      href: "/deputy-head/classes",
      animated: true,
    },
    {
      label: "Staff Attendance",
      value: null,
      icon: ClipboardCheck,
      iconClass: "bg-purple-50 text-purple-600",
      trend: "Today's session",
      href: "/deputy-head/attendance",
      animated: false,
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
            Deputy Head &mdash; {division}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          <TrendingUp size={11} className="mr-1" /> Term {currentTerm} &middot; {currentYear}
        </Badge>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                  ) : (
                    <p className={cn(
                      "text-sm font-semibold",
                      staffAttendanceToday ? "text-green-600" : "text-amber-600"
                    )}>
                      {staffAttendanceToday ? "Submitted ✓" : "Not yet marked"}
                    </p>
                  )}
                  <p className="text-xs font-medium mt-0.5">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.trend}</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-8">
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Staff in Division</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {staffList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff in this division.</p>
              ) : (
                staffList.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0"
                  >
                    <UserAvatar
                      photoUrl={member.photoUrl}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      size="sm"
                      gradient="from-orange-400 to-orange-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.rank}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] px-1.5 shrink-0 border",
                        roleColors[member.systemRole] ?? ""
                      )}
                    >
                      {member.systemRole}
                    </Badge>
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {[
                { label: "Students", href: "/deputy-head/students" },
                { label: "Staff Attendance", href: "/deputy-head/attendance" },
                { label: "Leave Requests", href: "/deputy-head/leave" },
                { label: "Lesson Plans", href: "/deputy-head/lesson-plans" },
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
