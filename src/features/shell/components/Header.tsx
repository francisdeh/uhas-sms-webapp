"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Bell, Search, User, Settings, LogOut, CheckCheck, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AcademicYearSwitcher } from "./AcademicYearSwitcher";
import { SearchCommand } from "./SearchCommand";
import type { SessionUser } from "@/features/auth/types";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { logoutAction } from "@/features/auth/actions/logout";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const MOCK_NOTIFICATIONS = [
  {
    id: "n1",
    title: "Lesson plan submitted",
    body: "Mr. Asante submitted a plan for JHS 2 Mathematics.",
    time: "5m ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Attendance alert",
    body: "3 students marked absent in Primary 4B today.",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n3",
    title: "Term 2 report ready",
    body: "JHS 3 end-of-term report is ready for review.",
    time: "3h ago",
    unread: false,
  },
  {
    id: "n4",
    title: "Parent message",
    body: "Mrs. Agyeman sent a message about Kwame's attendance.",
    time: "Yesterday",
    unread: false,
  },
];

interface HeaderProps {
  user: SessionUser;
  onMobileMenuOpen: () => void;
}

export function Header({ user, onMobileMenuOpen }: HeaderProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch {
      toast.error("Logout failed. Please try again.");
      return;
    }
    await logoutAction();
  }

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const profileHref = `${ROLE_DASHBOARD[user.role]}/profile`;
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <>
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} user={user} />

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="h-14 bg-card border-b border-border/60 flex items-center gap-3 px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden h-8 w-8 p-0"
          onClick={onMobileMenuOpen}
        >
          <Menu size={16} />
        </Button>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2.5 flex-1 h-9 px-3.5 rounded-lg border border-border/60 bg-muted/30 text-muted-foreground text-sm hover:bg-muted/60 hover:border-border transition-all cursor-pointer group"
        >
          <Search size={14} className="shrink-0 group-hover:text-foreground/60 transition-colors" />
          <span className="flex-1 truncate text-[13px]">Search pages, students, staff…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span>⌘</span>K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          <AcademicYearSwitcher />

          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title={mounted ? (resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
          >
            {mounted && (resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />)}
          </button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer">
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent-orange" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center justify-between py-2.5">
                  <span className="font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <Badge className="bg-accent-orange/10 text-accent-orange border-0 text-xs px-1.5">
                      {unreadCount} new
                    </Badge>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {MOCK_NOTIFICATIONS.map((n) => (
                <DropdownMenuGroup key={n.id}>
                  <DropdownMenuItem className="flex-col items-start gap-0.5 py-3 cursor-pointer px-3">
                    <div className="flex items-center gap-2 w-full">
                      {n.unread && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-orange flex-shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${n.unread ? "font-medium" : "font-normal text-muted-foreground"}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{n.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-3.5">{n.body}</p>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="justify-center cursor-pointer py-2.5">
                  <CheckCheck size={13} className="mr-1.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Mark all as read</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ml-0.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-gradient-to-br from-accent-orange to-red-400 text-white text-[10px] font-semibold">
                    {initials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <p className="font-medium truncate">{user.displayName}</p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    {user.linkedId && (
                      <span className="text-xs text-muted-foreground">{user.linkedId}</span>
                    )}
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-slate-600">
                      {user.role}
                    </span>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push(profileHref)} className="cursor-pointer">
                  <User size={14} className="mr-2" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/change-password")} className="cursor-pointer">
                  <Settings size={14} className="mr-2" /> Change Password
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="cursor-pointer text-red-500"
                >
                  <LogOut size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
