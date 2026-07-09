interface BuiltByAttributionProps {
  className?: string;
}

// Used in the login-page footer (dark background) and the dashboard
// sidebar footer (light background) — no explicit text color here so
// it inherits whatever the caller's wrapper sets.
export function BuiltByAttribution({ className }: BuiltByAttributionProps) {
  return (
    <span className={className}>
      Built by{" "}
      <a
        href="https://simplifydlabs.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-70 transition-opacity"
      >
        SimplifydLabs
      </a>
    </span>
  );
}
