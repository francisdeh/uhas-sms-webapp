"use client";

import { useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarRange,
  GraduationCap,
  ShieldCheck,
  Bell as BellIcon,
  Palette,
  CalendarOff,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SchoolSettings, GradingDefaults } from "@/features/settings/types";
import { IdentityTab } from "./IdentityTab";
import { CalendarTab } from "./CalendarTab";
import { GradingTab } from "./GradingTab";
import { CommunicationTab } from "./CommunicationTab";
import { SecurityTab } from "./SecurityTab";
import { BrandingTab } from "./BrandingTab";
import { LeaveTab } from "./LeaveTab";

const TABS = [
  { id: "identity", label: "Identity", icon: Building2 },
  { id: "calendar", label: "Calendar", icon: CalendarRange },
  { id: "grading", label: "Grading", icon: GraduationCap },
  { id: "communication", label: "Communication", icon: BellIcon },
  { id: "leave", label: "Leave", icon: CalendarOff },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "branding", label: "Branding", icon: Palette },
] as const;

export function SettingsPage({
  settings,
  gradingDefaults,
}: {
  settings: SchoolSettings;
  gradingDefaults: GradingDefaults;
}) {
  const requestedTab = useSearchParams().get("tab");
  const initialTab = TABS.some((t) => t.id === requestedTab) ? requestedTab! : "identity";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">School Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure school identity, calendar, grading, and policies. Every change is audit-logged.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="flex flex-col gap-0">
        <div className="bg-card dark:bg-slate-800/60 border border-border/60 rounded-xl rounded-b-none px-4 pt-3 overflow-x-auto">
          <TabsList variant="line" className="w-full justify-start gap-0 min-w-max">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="cursor-pointer px-4">
                <Icon size={15} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="identity">
          <AnimateIn>
            <IdentityTab settings={settings} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="calendar">
          <AnimateIn>
            <CalendarTab settings={settings} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="grading">
          <AnimateIn>
            <GradingTab settings={settings} defaults={gradingDefaults} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="communication">
          <AnimateIn>
            <CommunicationTab settings={settings} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="leave">
          <AnimateIn>
            <LeaveTab settings={settings} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="security">
          <AnimateIn>
            <SecurityTab settings={settings} />
          </AnimateIn>
        </TabsContent>
        <TabsContent value="branding">
          <AnimateIn>
            <BrandingTab settings={settings} />
          </AnimateIn>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AnimateIn({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
