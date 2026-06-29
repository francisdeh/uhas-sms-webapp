"use client";

import Image from "next/image";
import {
  LayoutDashboard,
  User,
  TrendingUp,
  ClipboardList,
  Calendar,
  BookOpen,
  BarChart2,
  Award,
  Star,
  HelpCircle,
  Settings,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, badge: 3, active: true },
];

const pages = [
  { label: "Student profile", icon: User, hasArrow: true },
  { label: "Progress", icon: TrendingUp, hasArrow: true },
  { label: "Assignments", icon: ClipboardList, badge: 3, hasArrow: true },
  { label: "Schedule", icon: Calendar, hasArrow: true },
  { label: "Resources", icon: BookOpen, hasArrow: true },
  { label: "Reports", icon: BarChart2, hasArrow: true },
  { label: "Certificates", icon: Award, hasArrow: true },
];

const chartItems = [
  { label: "Reviews", icon: Star },
  { label: "FAQ", icon: HelpCircle },
  { label: "Setting", icon: Settings, hasArrow: true },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  return (
    <aside
      className={cn(
        "min-h-screen bg-white border-r border-gray-100 flex flex-col flex-shrink-0 transition-all duration-300",
        isOpen ? "w-60" : "w-14"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-5 border-b border-gray-100 h-14">
        <Image
          src="/logo.png"
          alt="UHAS Basic School"
          width={32}
          height={32}
          className="rounded-full flex-shrink-0"
        />
        {isOpen && (
          <span className="font-bold text-[#1E293B] text-sm tracking-tight truncate flex-1">UHAS Basic School</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map((item) => (
          <NavItem key={item.label} {...item} isOpen={isOpen} />
        ))}

        {isOpen && (
          <div className="px-5 pt-4 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Pages</span>
          </div>
        )}
        {!isOpen && <div className="my-2 mx-3 border-t border-gray-100" />}
        {pages.map((item) => (
          <NavItem key={item.label} {...item} isOpen={isOpen} />
        ))}

        {isOpen && (
          <div className="px-5 pt-4 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Chart &amp; Maps</span>
          </div>
        )}
        {!isOpen && <div className="my-2 mx-3 border-t border-gray-100" />}
        {chartItems.map((item) => (
          <NavItem key={item.label} {...item} isOpen={isOpen} />
        ))}
      </nav>
    </aside>
  );
}

function NavItem({
  label,
  icon: Icon,
  badge,
  active,
  hasArrow,
  isOpen,
}: {
  label: string;
  icon: React.ElementType;
  badge?: number;
  active?: boolean;
  hasArrow?: boolean;
  isOpen: boolean;
}) {
  return (
    <div
      title={!isOpen ? label : undefined}
      className={cn(
        "flex items-center gap-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors",
        isOpen ? "px-3" : "px-0 justify-center",
        active
          ? "bg-accent-orange/10 text-accent-orange"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
      )}
    >
      <Icon size={16} className={cn("flex-shrink-0", active ? "text-accent-orange" : "")} />
      {isOpen && (
        <>
          <span className="text-sm font-medium flex-1 truncate">{label}</span>
          {badge && (
            <span className="text-[10px] font-semibold bg-accent-orange text-white rounded-full px-1.5 py-0.5 leading-none">
              {badge}
            </span>
          )}
          {hasArrow && !badge && <ChevronRight size={14} className="text-gray-300" />}
        </>
      )}
      {!isOpen && badge && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-accent-orange rounded-full" />
      )}
    </div>
  );
}
