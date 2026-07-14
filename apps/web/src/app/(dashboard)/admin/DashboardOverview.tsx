"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  Users,
  GraduationCap,
  BookOpen,
  Bell,
  TrendingUp,
  ArrowRight,
  ClipboardCheck,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { audienceLabel } from "@/features/announcements/types";
import type { Announcement } from "@/features/announcements/types";

// Icon names are passed as strings from the server page (React components
// can't cross the server→client boundary as props); we map them here.
export type StatIconName =
  | "students"
  | "staff"
  | "classes"
  | "alerts"
  | "attendance"
  | "lessonPlans";

const ICON_MAP = {
  students: GraduationCap,
  staff: Users,
  classes: BookOpen,
  alerts: Bell,
  attendance: ClipboardCheck,
  lessonPlans: FileText,
} as const;

interface StatCard {
  label: string;
  value: number;
  icon: StatIconName;
  iconClass: string;
  trend: string;
  href: string;
}

interface DivisionBar {
  label: string;
  count: number;
  color: string;
}

interface AdminDashboardOverviewProps {
  currentYear: string;
  currentTerm: number;
  totalActiveStudents: number;
  stats: StatCard[];
  recentAnnouncements: Announcement[];
  classOptions: { id: string; name: string }[];
  divisionBreakdown: DivisionBar[];
}

export default function AdminDashboardOverview({
  currentYear,
  currentTerm,
  totalActiveStudents,
  stats,
  recentAnnouncements,
  classOptions,
  divisionBreakdown,
}: AdminDashboardOverviewProps) {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back — here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          <TrendingUp size={11} className="mr-1" /> Term {currentTerm} · {currentYear}
        </Badge>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.22 }}
          >
            <Link href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-5">
                  <div className={`w-9 h-9 rounded-lg ${stat.iconClass} flex items-center justify-center mb-3`}>
                    {(() => {
                      const Icon = ICON_MAP[stat.icon];
                      return <Icon size={16} />;
                    })()}
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    <AnimatedNumber value={stat.value} />
                  </p>
                  <p className="text-xs font-medium mt-0.5">{stat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.trend}</p>
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
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Announcements</CardTitle>
              <Link href="/admin/announcements" className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ArrowRight size={12} className="ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <div>
                {recentAnnouncements.length === 0 && (
                  <p className="text-sm text-muted-foreground py-3">No announcements yet.</p>
                )}
                {recentAnnouncements.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.18 }}
                  >
                    <Link
                      href="/admin/announcements"
                      className="flex items-start gap-3 py-3 border-b border-border/40 last:border-0 -mx-2 px-2 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.isCritical ? "bg-red-400" : "bg-muted-foreground/30"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {audienceLabel(a.audience, classOptions)} &middot;{" "}
                          {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      {a.isCritical && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 shrink-0">Critical</Badge>
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
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
              <CardTitle className="text-sm font-semibold">School Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {divisionBreakdown.map((div) => (
                  <div key={div.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{div.label}</span>
                      <span className="text-muted-foreground">{div.count} students</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${
                            totalActiveStudents === 0 ? 0 : (div.count / totalActiveStudents) * 100
                          }%`,
                        }}
                        transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                        className={`h-full rounded-full ${div.color}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick Links</p>
                {[
                  { label: "Manage Students", href: "/admin/students" },
                  { label: "Manage Staff", href: "/admin/staff" },
                  { label: "View Reports", href: "/admin/reports" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    {link.label}
                    <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
