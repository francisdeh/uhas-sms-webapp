"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { GraduationCap, Users, School, Bell, LayoutDashboard } from "lucide-react";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
import { mockAnnouncements } from "@/lib/mock/announcements";
import { ROLE_CONFIG } from "@/features/shell/role-config";
import type { SessionUser } from "@/features/auth/types";

const RECENT_KEY = "uhas_recent_searches";
const MAX_RECENT = 5;

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SessionUser;
}

function readRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function SearchCommand({ open, onOpenChange, user }: SearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const recent = open ? readRecent() : [];

  const allPages = ROLE_CONFIG[user.role].navGroups.flatMap((g) => g.items);

  function saveRecent(term: string) {
    const updated = [term, ...recent.filter((r) => r !== term)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  }

  const navigate = useCallback(
    (href: string, term: string) => {
      saveRecent(term);
      onOpenChange(false);
      setQuery("");
      router.push(href);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recent, router, onOpenChange]
  );

  const q = query.toLowerCase();

  const pages = q
    ? allPages.filter((p) => p.label.toLowerCase().includes(q))
    : allPages;

  const students = q
    ? mockStudents
        .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  const staff = q
    ? mockStaff
        .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  const classes = q
    ? mockClasses.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5)
    : [];

  const announcements = q
    ? mockAnnouncements.filter((a) => a.title.toLowerCase().includes(q)).slice(0, 4)
    : [];

  const hasDataResults = students.length + staff.length + classes.length + announcements.length > 0;
  const hasResults = pages.length > 0 || hasDataResults;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput
          placeholder="Search pages, students, staff, classes…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!q && recent.length > 0 && (
            <CommandGroup heading="Recent searches">
              {recent.map((term) => (
                <CommandItem key={term} value={term} onSelect={() => setQuery(term)}>
                  <span className="text-muted-foreground text-xs">↩</span>
                  <span className="ml-2">{term}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {q && !hasResults && <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>}

          {pages.length > 0 && (
            <>
              {!q && recent.length > 0 && <CommandSeparator />}
              <CommandGroup heading={q ? "Pages" : "All pages"}>
                {pages.map((page) => (
                  <CommandItem
                    key={page.href}
                    value={page.label}
                    onSelect={() => navigate(page.href, page.label)}
                  >
                    <page.icon size={14} className="mr-2 text-muted-foreground" />
                    <span>{page.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {students.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Students">
                {students.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.firstName} ${s.lastName}`}
                    onSelect={() => navigate("/admin/students", `${s.firstName} ${s.lastName}`)}
                  >
                    <GraduationCap size={14} className="mr-2 text-muted-foreground" />
                    <span>{s.firstName} {s.lastName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.className}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {staff.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Staff">
                {staff.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.firstName} ${s.lastName}`}
                    onSelect={() => navigate("/admin/users", `${s.firstName} ${s.lastName}`)}
                  >
                    <Users size={14} className="mr-2 text-muted-foreground" />
                    <span>{s.firstName} {s.lastName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.rank}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {classes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Classes">
                {classes.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => navigate("/admin/classes", c.name)}
                  >
                    <School size={14} className="mr-2 text-muted-foreground" />
                    <span>{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.division}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {announcements.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Announcements">
                {announcements.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.title}
                    onSelect={() => navigate("/admin", a.title)}
                  >
                    <Bell size={14} className="mr-2 text-muted-foreground" />
                    <span className="truncate">{a.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
