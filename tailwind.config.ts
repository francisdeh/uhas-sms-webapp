import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F4F5F7",
        sidebar: "#ffffff",
        card: "#ffffff",
        border: "#E5E7EB",
        accent: {
          orange: "#F97316",
          teal: "#10B981",
          navy: "#1E293B",
          blue: "#3B82F6",
          purple: "#8B5CF6",
        },
        muted: "#6B7280",
        "muted-foreground": "#9CA3AF",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
    },
  },
  plugins: [],
};

export default config;
