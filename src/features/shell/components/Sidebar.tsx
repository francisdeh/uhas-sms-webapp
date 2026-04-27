"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { User, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { NavGroup, ShellConfig } from "@/features/shell/types";
import type { SessionUser } from "@/features/auth/types";
import { ROLE_CONFIG } from "@/features/shell/role-config";

const COLLAPSED_KEY = "uhas_sidebar_collapsed";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

interface SidebarProps {
  user: SessionUser;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ user, mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "true"
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  const config = ROLE_CONFIG[user.role];

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "hidden lg:flex flex-col h-screen bg-sidebar border-r border-border/60 flex-shrink-0 overflow-hidden"
        )}
        style={{ width: collapsed ? 64 : 240 }}
      >
        <SidebarContent
          user={user}
          config={config}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
        />
      </motion.aside>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="w-60 p-0 flex flex-col">
          <SidebarContent
            user={user}
            config={config}
            collapsed={false}
            onToggle={onMobileClose}
            onNavClick={onMobileClose}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarContent({
  user,
  config,
  collapsed,
  onToggle,
  onNavClick,
}: {
  user: SessionUser;
  config: ShellConfig;
  collapsed: boolean;
  onToggle: () => void;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center h-14 border-b border-border/60">
        <button
          onClick={onToggle}
          className="flex items-center gap-2.5 pl-3 pr-2 h-full flex-1 min-w-0 cursor-pointer hover:bg-muted/40 transition-colors"
        >
          <Image
            src="/logo.png"
            alt="UHAS Basic School"
            width={30}
            height={30}
            className="rounded-full flex-shrink-0"
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="font-bold text-foreground text-sm tracking-tight truncate overflow-hidden whitespace-nowrap"
              >
                UHAS Basic School
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={onToggle}
              title="Collapse sidebar"
              className="flex-shrink-0 h-full px-2.5 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <ChevronLeft size={15} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {config.navGroups.map((group: NavGroup, gi: number) => (
          <NavGroupSection
            key={gi}
            group={group}
            collapsed={collapsed}
            pathname={pathname}
            groupIndex={gi}
            onNavClick={onNavClick}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-border/60 p-2">
        <Link
          href={`/${user.role.toLowerCase().replace("deputyhead", "deputy-head")}/profile`}
          onClick={onNavClick}
          className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-muted/60 transition-colors group"
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-accent-orange to-red-400 text-white text-xs font-semibold">
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="min-w-0 overflow-hidden"
              >
                <p className="text-sm font-medium truncate leading-tight">{user.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>
    </div>
    </>
  );
}

function NavGroupSection({
  group,
  collapsed,
  pathname,
  groupIndex,
  onNavClick,
}: {
  group: NavGroup;
  collapsed: boolean;
  pathname: string;
  groupIndex: number;
  onNavClick?: () => void;
}) {
  return (
    <div>
      <AnimatePresence initial={false}>
        {!collapsed && group.groupLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 px-4 pb-1.5"
          >
            <span className="h-1 w-1 rounded-full bg-slate-800 dark:bg-slate-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-700 dark:text-slate-400">
              {group.groupLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <ul className="space-y-0.5 px-2">
        {group.items.map((item, i) => {
          const isActive =
            item.href === `/${pathname.split("/")[1]}`
              ? pathname === item.href
              : pathname.startsWith(item.href);

          const delay = (groupIndex * group.items.length + i) * 0.03;

          return (
            <motion.li
              key={item.href}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay, duration: 0.18 }}
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger>
                    <Link
                      href={item.href}
                      onClick={onNavClick}
                      className={cn(
                        "flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-colors",
                        isActive
                          ? "bg-accent-orange/10 text-accent-orange"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon size={16} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href={item.href}
                  onClick={onNavClick}
                  className={cn(
                    "relative flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-accent-orange/10 text-accent-orange font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground font-normal"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeNav"
                      className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-accent-orange"
                    />
                  )}
                  <item.icon size={15} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-4 px-1 text-[10px] bg-accent-orange text-white hover:bg-accent-orange"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
