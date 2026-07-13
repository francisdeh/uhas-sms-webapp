import Image from "next/image";
import { GraduationCap, ClipboardList, BarChart3 } from "lucide-react";
import ParticlesBg from "@/components/ParticlesBg";
import { BuiltByAttribution } from "@/components/BuiltByAttribution";
import type { SchoolBranding } from "@/features/settings/queries/get-public-school-branding";

const FEATURES = [
  { icon: GraduationCap, label: "Student & staff records" },
  { icon: ClipboardList, label: "Attendance & lesson plans" },
  { icon: BarChart3, label: "Exams, results & reports" },
];

interface AuthBrandPanelProps {
  settings: SchoolBranding;
}

/**
 * The left-hand hero panel shared by every pre-auth page (login,
 * reset-password) — school photo background, logo/wordmark, feature
 * list, and footer attribution. Extracted so the two pages can't drift
 * out of visual sync the way they previously did.
 */
export function AuthBrandPanel({ settings }: AuthBrandPanelProps) {
  const logoSrc = settings.logoUrl ?? "/logo.png";
  const schoolWords = settings.name.split(" ");
  const firstWord = schoolWords[0] ?? "UHAS";
  const restWords = schoolWords.slice(1).join(" ") || "Basic School";

  return (
    <div className="hidden lg:flex lg:w-[42%] xl:w-[38%] flex-col justify-between p-12 relative overflow-hidden bg-slate-900">
      {/* School photo background. Heavy dark overlay keeps the white
          logo + heading + feature list legible. */}
      <Image
        src="/login-hero.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 38vw, (min-width: 1024px) 42vw, 0px"
        className="object-cover opacity-55"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(15,30,46,0.78) 0%, rgba(15,30,46,0.88) 60%, rgba(8,16,26,0.94) 100%)",
        }}
      />

      <ParticlesBg />

      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent-orange via-accent-orange/60 to-transparent" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-16">
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-lg shadow-black/20 flex-shrink-0 overflow-hidden">
            <Image src={logoSrc} alt={settings.name} width={40} height={40} className="rounded-full object-cover" />
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="text-white/70 text-sm tracking-wider uppercase font-medium">SMS</span>
        </div>

        <h1
          className="text-white leading-tight mb-4"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(2rem, 3vw, 2.75rem)" }}
        >
          <span className="font-semibold tracking-wide">{firstWord}</span>
          <br />
          <span className="font-bold">{restWords}</span>
        </h1>
        <p className="text-white/50 text-sm leading-relaxed max-w-xs">
          A centralised platform for managing students, staff, and academic operations across all divisions.
        </p>
      </div>

      <div className="relative z-10 space-y-4">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <Icon size={15} className="text-accent-orange" />
            </div>
            <span className="text-white/60 text-sm">{label}</span>
          </div>
        ))}
      </div>

      <p className="relative z-10 text-white/25 text-xs">
        © {new Date().getFullYear()} {settings.name} · Management System ·{" "}
        <BuiltByAttribution />
      </p>
    </div>
  );
}
