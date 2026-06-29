"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEGMENT_LABELS: Record<string, string> = {
  students: "Students",
  staff: "Staff",
  classes: "Classes",
  attendance: "Attendance",
  subjects: "Subjects",
  users: "Users",
  profile: "My Profile",
  "lesson-plans": "Lesson Plans",
  examinations: "Examinations",
  reports: "Reports",
  settings: "Settings",
  leave: "Leave Requests",
  department: "My Department",
  children: "Children",
  results: "Results",
  announcements: "Announcements",
};

const NEW_LABELS: Record<string, string> = {
  students: "Register Student",
  staff: "Register Staff",
  classes: "New Class",
};

function segmentLabel(segment: string, parent?: string): string {
  if (segment === "new") return (parent && NEW_LABELS[parent]) ?? "New";
  return SEGMENT_LABELS[segment] ?? segment;
}

export function AutoBreadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return null;

  const isOnRoot = parts.length === 1;
  const rootHref = `/${parts[0]}`;

  const items: { label: string; href?: string }[] = [
    { label: "Overview", href: isOnRoot ? undefined : rootHref },
  ];

  for (let i = 1; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const href = "/" + parts.slice(0, i + 1).join("/");
    items.push({
      label: segmentLabel(parts[i], parts[i - 1]),
      href: isLast ? undefined : href,
    });
  }

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink render={<Link href={item.href} />}>
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
