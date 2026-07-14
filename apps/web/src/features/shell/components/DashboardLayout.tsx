"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AutoBreadcrumb } from "./AutoBreadcrumb";
import { SessionExpiryWatcher } from "@/features/auth/components/SessionExpiryWatcher";
import { BreadcrumbLabelProvider } from "@/features/shell/breadcrumb-context";
import { isDevMode, DEV_BANNER_HEIGHT_REM } from "@/components/DevModeBanner";
import type { SessionUser } from "@/features/auth/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: SessionUser;
  currentYear: string;
  yearOptions: string[];
  navBadges: Record<string, number>;
  schoolName?: string;
  schoolLogoUrl?: string | null;
}

export function DashboardLayout({
  children,
  user,
  currentYear,
  yearOptions,
  navBadges,
  schoolName = "UHAS Basic School",
  schoolLogoUrl = null,
}: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <BreadcrumbLabelProvider>
      <div
        className="flex bg-muted/30 dark:bg-background overflow-hidden"
        // The dev-mode banner (rendered above this in the root layout) eats
        // into the viewport — shrink by exactly its height so this shell's
        // bottom edge doesn't clip below the visible viewport. Full
        // `100vh` in production, where the banner is absent.
        style={{ height: isDevMode() ? `calc(100vh - ${DEV_BANNER_HEIGHT_REM})` : "100vh" }}
      >
        <Sidebar
          user={user}
          navBadges={navBadges}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          schoolName={schoolName}
          schoolLogoUrl={schoolLogoUrl}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header
            user={user}
            currentYear={currentYear}
            yearOptions={yearOptions}
            onMobileMenuOpen={() => setMobileOpen(true)}
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
    </BreadcrumbLabelProvider>
  );
}
