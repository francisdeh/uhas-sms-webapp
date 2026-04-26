"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { GraduationCap, Users, BookOpen, FileText, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { SchoolClass } from "@/features/classes/types";

interface Props {
  displayName: string;
  stats: { students: number; staff: number; subjects: number };
  jhsClasses: SchoolClass[];
}

export default function HODDashboardOverview({ displayName: _displayName, stats, jhsClasses }: Props) {
  const statCards = [
    {
      label: "JHS Students",
      value: stats.students,
      trend: "Active",
      icon: GraduationCap,
      iconClass: "bg-blue-50 text-blue-600",
      href: "#",
      animated: true,
    },
    {
      label: "JHS Staff",
      value: stats.staff,
      trend: "Active members",
      icon: Users,
      iconClass: "bg-orange-50 text-accent-orange",
      href: "#",
      animated: true,
    },
    {
      label: "Subjects",
      value: stats.subjects,
      trend: "JHS curriculum",
      icon: BookOpen,
      iconClass: "bg-green-50 text-green-600",
      href: "#",
      animated: true,
    },
    {
      label: "Lesson Plans",
      value: null,
      trend: "Pending review",
      icon: FileText,
      iconClass: "bg-purple-50 text-purple-600",
      href: "/hod/lesson-plans",
      animated: false,
    },
  ];

  const quickLinks = [
    { label: "My Department", href: "/hod/department", badge: null },
    { label: "Lesson Plans", href: "/hod/lesson-plans", badge: "2" },
    { label: "Examinations", href: "/hod/examinations", badge: null },
    { label: "Reports", href: "/hod/reports", badge: null },
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
          <p className="text-sm text-muted-foreground mt-0.5">Head of Department — JHS</p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          <TrendingUp size={11} className="mr-1" /> Term 1 · 2025/2026
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
                      card.iconClass,
                    )}
                  >
                    <card.icon size={16} />
                  </div>
                  {card.animated && card.value !== null ? (
                    <p className="text-2xl font-bold tabular-nums">
                      <AnimatedNumber value={card.value} />
                    </p>
                  ) : (
                    <p className="text-lg font-bold">Review Plans →</p>
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
              <CardTitle className="text-sm font-semibold">JHS Classes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {jhsClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No JHS classes found.</p>
              ) : (
                jhsClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{cls.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cls.classTeacherName ?? "No teacher assigned"}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-orange-100 text-orange-700"
                    >
                      {cls.division}
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
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  {link.badge ? (
                    <span className="flex items-center gap-2">
                      {link.label}
                      <Badge className="text-[10px] px-1.5 py-0">{link.badge}</Badge>
                    </span>
                  ) : (
                    link.label
                  )}
                  <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
