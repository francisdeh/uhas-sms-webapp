import Image from "next/image";
import { redirect } from "next/navigation";
import { GraduationCap, ClipboardList, BarChart3 } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import LoginForm from "@/features/auth/components/LoginForm";
import ParticlesBg from "@/components/ParticlesBg";

const features = [
  { icon: GraduationCap, label: "Student & staff records" },
  { icon: ClipboardList,  label: "Attendance & lesson plans" },
  { icon: BarChart3,      label: "Exams, results & reports" },
];

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(ROLE_DASHBOARD[user.role]);

  return (
    <div className="min-h-screen flex">
      {/* ── Left brand panel ─────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[38%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1E293B 0%, #0F1E2E 100%)" }}
      >
        {/* Moving particles */}
        <ParticlesBg />

        {/* Orange accent bar */}
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#F97316] via-[#F97316]/60 to-transparent" />

        {/* Top: logo + wordmark */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-lg shadow-black/20 flex-shrink-0">
              <Image src="/logo.png" alt="UHAS Basic School" width={40} height={40} className="rounded-full" />
            </div>
            <div className="h-8 w-px bg-white/20" />
            <span className="text-white/70 text-sm tracking-wider uppercase font-medium">
              SMS
            </span>
          </div>

          <h1
            className="text-white leading-tight mb-4"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(2rem, 3vw, 2.75rem)",
            }}
          >
            <span className="font-semibold tracking-wide">UHAS</span>
            <br />
            <span className="font-bold">Basic School</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            A centralised platform for managing students, staff, and academic operations across all divisions.
          </p>
        </div>

        {/* Middle: feature list */}
        <div className="relative z-10 space-y-4">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-[#F97316]" />
              </div>
              <span className="text-white/60 text-sm">{label}</span>
            </div>
          ))}
        </div>

        {/* Bottom: footer note */}
        <p className="relative z-10 text-white/25 text-xs">
          © {new Date().getFullYear()} UHAS Basic School · Management System v1
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#F8F7F4] px-6 py-12">
        <LoginForm />
      </div>
    </div>
  );
}
