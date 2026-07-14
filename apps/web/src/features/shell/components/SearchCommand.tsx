"use client";

import { useState, useCallback, useEffect } from "react";
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
import {
  GraduationCap,
  Users,
  School,
  Wallet,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";
import { getShellConfig } from "@/features/shell/role-config";
import { api } from "@/lib/api/browser";
import type { GlobalSearchResults } from "@/features/shell/types";
import type { SessionUser, UserRole } from "@/features/auth/types";
import {
  ROLE_DASHBOARD,
  ADMIN,
  DEPUTY_HEAD,
  TEACHER,
  PARENT,
  ACCOUNTANT,
} from "@/features/auth/types";

const RECENT_KEY = "uhas_recent_searches";
const MAX_RECENT = 5;

// Every (role, entity-type) pair below has a real destination — either a
// per-item detail route, or (lesson plans/schemes for Admin/DeputyHead,
// which are reviewed via expand-in-place lists, not `[id]` routes) the
// list page with a `?focus=` param those pages read to open the right card.
function studentHref(role: UserRole, id: string): string {
  if (role === ADMIN) return `/admin/students/${id}`;
  if (role === DEPUTY_HEAD) return `/deputy-head/students/${id}`;
  if (role === PARENT) return `/parent/children/${id}`;
  if (role === TEACHER) return `/teacher/students/${id}`;
  return ROLE_DASHBOARD[role];
}

function staffHref(role: UserRole, id: string): string {
  if (role === ADMIN) return `/admin/staff/${id}`;
  if (role === DEPUTY_HEAD) return `/deputy-head/staff/${id}`;
  return ROLE_DASHBOARD[role];
}

function classHref(role: UserRole, id: string): string {
  if (role === ADMIN) return `/admin/classes/${id}`;
  if (role === DEPUTY_HEAD) return `/deputy-head/classes/${id}`;
  return ROLE_DASHBOARD[role];
}

function feeItemHref(role: UserRole, id: string): string {
  if (role === ACCOUNTANT) return `/accountant/fee-items/${id}`;
  return ROLE_DASHBOARD[role];
}

function lessonPlanHref(role: UserRole, id: string): string {
  if (role === TEACHER) return `/teacher/lesson-plans/${id}`;
  if (role === DEPUTY_HEAD) return `/deputy-head/lesson-plans?focus=${id}`;
  if (role === ADMIN) return `/admin/lesson-plans?focus=${id}`;
  return ROLE_DASHBOARD[role];
}

function schemeHref(role: UserRole, id: string): string {
  if (role === TEACHER) return `/teacher/schemes/${id}`;
  if (role === DEPUTY_HEAD) return `/deputy-head/schemes?focus=${id}`;
  if (role === ADMIN) return `/admin/schemes?focus=${id}`;
  return ROLE_DASHBOARD[role];
}

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
  const [results, setResults] = useState<GlobalSearchResults>({
    students: [],
    staff: [],
    classes: [],
    feeItems: [],
    lessonPlans: [],
    schemes: [],
  });

  const recent = open ? readRecent() : [];
  const allPages = getShellConfig(user).navGroups.flatMap((g) => g.items);

  // Debounce the server query to avoid hammering on each keystroke
  useEffect(() => {
    const handle = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) {
        setResults({ students: [], staff: [], classes: [], feeItems: [], lessonPlans: [], schemes: [] });
        return;
      }
      try {
        const r = await api.search.global(q);
        setResults({
          students: r.students.map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
          staff: r.staff.map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
          classes: r.classes.map((c) => ({ id: c.id, name: c.name })),
          feeItems: r.feeItems.map((f) => ({ id: f.id, name: f.name })),
          lessonPlans: r.lessonPlans.map((l) => ({ id: l.id, topic: l.topic })),
          schemes: r.schemes.map((s) => ({ id: s.id, title: s.title })),
        });
      } catch {
        setResults({ students: [], staff: [], classes: [], feeItems: [], lessonPlans: [], schemes: [] });
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

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
  const pages = q ? allPages.filter((p) => p.label.toLowerCase().includes(q)) : allPages;

  const { students, staff, classes, feeItems, lessonPlans, schemes } = results;
  const hasDataResults =
    students.length +
      staff.length +
      classes.length +
      feeItems.length +
      lessonPlans.length +
      schemes.length >
    0;
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
                {pages.map((page) => {
                  const Icon = page.icon ?? LayoutDashboard;
                  return (
                    <CommandItem
                      key={page.href}
                      value={page.label}
                      onSelect={() => navigate(page.href, page.label)}
                    >
                      <Icon size={14} className="mr-2 text-muted-foreground" />
                      <span>{page.label}</span>
                    </CommandItem>
                  );
                })}
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
                    value={s.name}
                    onSelect={() => navigate(studentHref(user.role, s.id), s.name)}
                  >
                    <GraduationCap size={14} className="mr-2 text-muted-foreground" />
                    <span>{s.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.slug}</span>
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
                    value={s.name}
                    onSelect={() => navigate(staffHref(user.role, s.id), s.name)}
                  >
                    <Users size={14} className="mr-2 text-muted-foreground" />
                    <span>{s.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.slug}</span>
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
                    onSelect={() => navigate(classHref(user.role, c.id), c.name)}
                  >
                    <School size={14} className="mr-2 text-muted-foreground" />
                    <span>{c.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {feeItems.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Fee Items">
                {feeItems.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={f.name}
                    onSelect={() => navigate(feeItemHref(user.role, f.id), f.name)}
                  >
                    <Wallet size={14} className="mr-2 text-muted-foreground" />
                    <span>{f.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {lessonPlans.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Lesson Plans">
                {lessonPlans.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={l.topic}
                    onSelect={() => navigate(lessonPlanHref(user.role, l.id), l.topic)}
                  >
                    <BookOpen size={14} className="mr-2 text-muted-foreground" />
                    <span className="truncate">{l.topic}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {schemes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Schemes">
                {schemes.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.title}
                    onSelect={() => navigate(schemeHref(user.role, s.id), s.title)}
                  >
                    <ClipboardList size={14} className="mr-2 text-muted-foreground" />
                    <span className="truncate">{s.title}</span>
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
