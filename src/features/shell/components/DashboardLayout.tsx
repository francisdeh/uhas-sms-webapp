"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AutoBreadcrumb } from "./AutoBreadcrumb";
import { SessionExpiryWatcher } from "@/features/auth/components/SessionExpiryWatcher";
import type { SessionUser } from "@/features/auth/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: SessionUser;
  currentYear: string;
  navBadges: Record<string, number>;
  userPhotoUrl?: string | null;
  schoolName?: string;
  schoolLogoUrl?: string | null;
}

export function DashboardLayout({
  children,
  user,
  currentYear,
  navBadges,
  userPhotoUrl = null,
  schoolName = "UHAS Basic School",
  schoolLogoUrl = null,
}: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-muted/30 dark:bg-background overflow-hidden">
      <Sidebar
        user={user}
        navBadges={navBadges}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        userPhotoUrl={userPhotoUrl}
        schoolName={schoolName}
        schoolLogoUrl={schoolLogoUrl}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          user={user}
          currentYear={currentYear}
          onMobileMenuOpen={() => setMobileOpen(true)}
          userPhotoUrl={userPhotoUrl}
        />
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex-1 overflow-y-auto p-4 sm:p-6"
          >
            <AutoBreadcrumb />
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <SessionExpiryWatcher />
    </div>
  );
}
