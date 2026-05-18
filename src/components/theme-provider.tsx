"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
export type ColorScheme = "default" | "uhas";

const THEME_KEY = "uhas_theme";
const COLOR_SCHEME_KEY = "uhas_color_scheme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  colorScheme: ColorScheme;
  setColorScheme: (c: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  colorScheme: "default",
  setColorScheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getResolved(t: Theme): "light" | "dark" {
  if (t === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return t;
}

function applyTheme(t: Theme) {
  const resolved = getResolved(t);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function applyColorScheme(c: ColorScheme) {
  if (c === "default") {
    document.documentElement.removeAttribute("data-color-scheme");
  } else {
    document.documentElement.setAttribute("data-color-scheme", c);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("default");

  // Post-hydration sync: server and first client render use defaults to avoid
  // hydration mismatch; localStorage is read only after mount.
  useEffect(() => {
    const savedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
    const savedScheme = (localStorage.getItem(COLOR_SCHEME_KEY) as ColorScheme | null) ?? "default";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(savedTheme);
    setColorSchemeState(savedScheme);
    applyTheme(savedTheme);
    applyColorScheme(savedScheme);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }

  function setColorScheme(c: ColorScheme) {
    setColorSchemeState(c);
    localStorage.setItem(COLOR_SCHEME_KEY, c);
    applyColorScheme(c);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: getResolved(theme),
        setTheme,
        colorScheme,
        setColorScheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
