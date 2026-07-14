"use client";

import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";

interface BreadcrumbLabelProps {
  segment: string | undefined;
  label: string | undefined;
}

/**
 * Headless bridge for Server Component pages that fetch a dynamic route
 * segment's display name but render no Client Component of their own to
 * host `useBreadcrumbLabel`. Renders nothing.
 */
export function BreadcrumbLabel({ segment, label }: BreadcrumbLabelProps) {
  useBreadcrumbLabel(segment, label);
  return null;
}
