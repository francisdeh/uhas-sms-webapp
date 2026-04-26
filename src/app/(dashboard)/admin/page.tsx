"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMotionValue, useSpring } from "motion/react";
import { Users, GraduationCap, BookOpen, Bell, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockAnnouncements } from "@/lib/mock/announcements";

const activeStudents = mockStudents.filter((s) => s.isActive).length;
const activeStaff = mockStaff.filter((s) => s.isActive).length;
const criticalAnnouncements = mockAnnouncements.filter((a) => a.isCritical).length;

const stats = [
  {
    label: "Total Students",
    value: activeStudents,
    icon: GraduationCap,
    iconClass: "bg-blue-50 text-blue-600",
    trend: "+3 this term",
    href: "/admin/students",
  },
  {
    label: "Total Staff",
    value: activeStaff,
    icon: Users,
    iconClass: "bg-orange-50 text-accent-orange",
    trend: "Fully staffed",
    href: "/admin/users",
  },
  {
    label: "Active Classes",
    value: 11,
    icon: BookOpen,
    iconClass: "bg-green-50 text-green-600",
    trend: "KG · Primary · JHS",
    href: "#",
  },
  {
    label: "Critical Alerts",
    value: criticalAnnouncements,
    icon: Bell,
    iconClass: "bg-red-50 text-red-500",
    trend: "Requires attention",
    href: "#",
  },
];

function AnimatedNumber({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 20 });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toString();
    });
  }, [spring]);

  return <span ref={ref}>0</span>;
}

export default function AdminDashboardPage() {
  return (
    <div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back — here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          <TrendingUp size={11} className="mr-1" /> Term 1 · 2025/2026
        </Badge>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                    <stat.icon size={16} />
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

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Announcements */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Announcements</CardTitle>
              <Link href="#" className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ArrowRight size={12} className="ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <div>
                {mockAnnouncements.slice(0, 5).map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.18 }}
                    className="flex items-start gap-3 py-3 border-b border-border/40 last:border-0"
                  >
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.isCritical ? "bg-red-400" : "bg-muted-foreground/30"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.audience === "all" ? "School-wide" : a.audience} &middot;{" "}
                        {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    {a.isCritical && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 shrink-0">Critical</Badge>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* School breakdown */}
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
                {[
                  { label: "KG", count: mockStudents.filter((s) => s.division === "KG" && s.isActive).length, color: "bg-purple-400" },
                  { label: "Primary", count: mockStudents.filter((s) => s.division === "Primary" && s.isActive).length, color: "bg-blue-400" },
                  { label: "JHS", count: mockStudents.filter((s) => s.division === "JHS" && s.isActive).length, color: "bg-accent-orange" },
                ].map((div) => (
                  <div key={div.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{div.label}</span>
                      <span className="text-muted-foreground">{div.count} students</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(div.count / activeStudents) * 100}%` }}
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
                  { label: "Manage Staff", href: "/admin/users" },
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
