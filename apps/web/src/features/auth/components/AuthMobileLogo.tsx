import Image from "next/image";
import type { SchoolBranding } from "@/features/settings/queries/get-public-school-branding";

/**
 * Mobile-only logo + name shown above the login/reset-password forms
 * (the desktop `AuthBrandPanel` hero is hidden below `lg:`). Extracted
 * for the same reason `AuthBrandPanel` was — so the school's real
 * logo/name can't drift out of sync between the two pre-auth pages.
 */
export function AuthMobileLogo({ settings }: { settings: SchoolBranding }) {
  return (
    <div className="lg:hidden flex items-center gap-2.5 mb-8">
      <Image
        src={settings.logoUrl ?? "/logo.png"}
        alt={settings.name}
        width={32}
        height={32}
        className="rounded-full object-cover"
      />
      <div>
        <p className="text-sm font-semibold leading-tight">{settings.name}</p>
        <p className="text-xs text-muted-foreground">Management System</p>
      </div>
    </div>
  );
}
