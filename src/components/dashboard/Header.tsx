"use client";

import { Share2, Zap, Bell, Menu, User, Settings, LogOut, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: hamburger + search */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
          title="Toggle sidebar"
        >
          <Menu size={15} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 w-64">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <span className="text-sm text-gray-400">Type to search...</span>
        </div>
      </div>

      {/* Right: actions + profile */}
      <div className="flex items-center gap-3">
        <button className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <Share2 size={15} className="text-gray-500" />
        </button>
        <button className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <Zap size={15} className="text-gray-500" />
        </button>
        <button className="relative w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <Bell size={15} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#F97316] rounded-full" />
        </button>

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 cursor-pointer rounded-lg px-1 py-1 hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F97316] to-[#EF4444] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">AD</span>
            </div>
            <ChevronDown
              size={13}
              className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F97316] to-[#EF4444] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">AD</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">Admin User</p>
                  <p className="text-xs text-gray-400 truncate">admin@uhas.edu.gh</p>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <DropdownItem icon={User} label="Profile" />
                <DropdownItem icon={Settings} label="Settings" />
              </div>

              <div className="border-t border-gray-100 py-1">
                <DropdownItem icon={LogOut} label="Logout" destructive />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownItem({
  icon: Icon,
  label,
  destructive,
}: {
  icon: React.ElementType;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${
        destructive ? "text-red-500" : "text-gray-600"
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}
