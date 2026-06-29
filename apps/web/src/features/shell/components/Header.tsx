"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, User, Settings, LogOut, Sun, Moon, Palette, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
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
import { NotificationsDropdown } from "@/features/notifications/components/NotificationsDropdown";
import type { SessionUser } from "@/features/auth/types";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { logoutAction } from "@/features/auth/actions/logout";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";

interface HeaderProps {
  user: SessionUser;
  currentYear: string;
  onMobileMenuOpen: () => void;
  userPhotoUrl?: string | null;
}

export function Header({ user, currentYear, onMobileMenuOpen, userPhotoUrl = null }: HeaderProps) {
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

  const { theme, resolvedTheme, setTheme, colorScheme, setColorScheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const isUhasScheme = colorScheme === "uhas";

  const COLOR_SCHEMES: { id: "default" | "uhas"; label: string; swatch: string }[] = [
    { id: "default", label: "Default", swatch: "#F97316" },
    { id: "uhas", label: "UHAS Brand", swatch: "#1B6B3E" },
  ];
  const THEME_OPTIONS: { id: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  const profileHref = `${ROLE_DASHBOARD[user.role]}/profile`;

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
          className="flex items-center gap-2.5 flex-1 min-w-0 h-9 px-3.5 rounded-lg border border-border/60 bg-muted/30 text-muted-foreground text-sm hover:bg-muted/60 hover:border-border transition-all cursor-pointer group"
        >
          <Search size={14} className="shrink-0 group-hover:text-foreground/60 transition-colors" />
          <span className="flex-1 min-w-0 truncate text-[13px] text-left">Search pages, students, staff…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span>⌘</span>K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          <AcademicYearSwitcher currentYear={currentYear} />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer relative"
              title="Colour scheme"
            >
              <Palette size={15} />
              {mounted && isUhasScheme && (
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-brand" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Colour scheme
                </DropdownMenuLabel>
                {COLOR_SCHEMES.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => setColorScheme(opt.id)}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-border/60 flex-shrink-0"
                      style={{ backgroundColor: opt.swatch }}
                    />
                    <span className="flex-1 text-sm">{opt.label}</span>
                    {mounted && colorScheme === opt.id && (
                      <Check size={13} className="text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer relative"
              title="Appearance"
            >
              {mounted ? (resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />) : <Moon size={15} />}
              {mounted && theme === "system" && (
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Appearance
                </DropdownMenuLabel>
                {THEME_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <opt.icon size={14} className="text-muted-foreground" />
                    <span className="flex-1 text-sm">{opt.label}</span>
                    {mounted && theme === opt.id && (
                      <Check size={13} className="text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications — live data, polls every 60s */}
          <NotificationsDropdown />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ml-0.5">
                <UserAvatar
                  photoUrl={userPhotoUrl}
                  firstName={user.displayName?.split(" ")[0] ?? "?"}
                  lastName={user.displayName?.split(" ").slice(1).join(" ") ?? ""}
                  size="xs"
                  gradient="from-accent-orange to-red-400"
                />
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
                {mounted && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                      className="cursor-pointer sm:hidden"
                    >
                      {resolvedTheme === "dark"
                        ? <Sun size={14} className="mr-2" />
                        : <Moon size={14} className="mr-2" />}
                      {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setColorScheme(isUhasScheme ? "default" : "uhas")}
                      className="cursor-pointer sm:hidden"
                    >
                      <Palette size={14} className="mr-2" />
                      {isUhasScheme ? "Default colours" : "UHAS brand colours"}
                    </DropdownMenuItem>
                  </>
                )}
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
