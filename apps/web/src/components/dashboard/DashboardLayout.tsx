"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { SessionUser } from "@/features/auth/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: SessionUser;
}

export default function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      <Sidebar isOpen={sidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          user={user}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
