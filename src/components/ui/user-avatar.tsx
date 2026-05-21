import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-base",
  xl: "h-24 w-24 text-2xl",
} as const;

type Props = {
  photoUrl?: string | null;
  firstName: string;
  lastName?: string;
  size?: keyof typeof SIZE_CLASS;
  gradient?: string;
  className?: string;
};

// Single source of truth for "person avatar". If `photoUrl` is set, renders
// the image (object-cover, rounded). Otherwise falls back to initials inside
// a coloured gradient circle. Drop-in replacement for the existing inline
// `<div className="rounded-full bg-gradient-to-br …">{initials}</div>` blocks.
export function UserAvatar({
  photoUrl,
  firstName,
  lastName = "",
  size = "md",
  gradient = "from-blue-400 to-blue-600",
  className,
}: Props) {
  const initials = (
    (firstName?.[0] ?? "") + (lastName?.[0] ?? "")
  ).toUpperCase();

  const sizing = SIZE_CLASS[size];

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName}`.trim()}
        className={cn(
          "rounded-full object-cover flex-shrink-0 bg-muted",
          sizing,
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold flex-shrink-0",
        gradient,
        sizing,
        className
      )}
    >
      {initials || "?"}
    </div>
  );
}
