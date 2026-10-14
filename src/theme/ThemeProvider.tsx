// File: src/theme/ThemeProvider.tsx
// Native port of web useTheme.tsx + usePageThemeSync.ts.
//   • theme setting: "light" | "dark" | "system", persisted ("ako-theme")
//   • page mode: personal vs Page identity (burnt-orange palette), persisted
//     as a launch hint ("ako-active-mode")
// The active palette is injected as runtime CSS variables, so every utility
// class (bg-canvas, text-ink, border-border, …) re-themes with no component
// changes — the same approach as the web app's .dark / .page-mode classes.
import "@/lib/polyfills";
import { VariableContextProvider } from "nativewind";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, useColorScheme, View } from "react-native";

import { getPalette, paletteToCssVars, type ColorScheme, type Palette } from "./palettes";

export type ThemeSetting = "light" | "dark" | "system";

const THEME_KEY = "ako-theme";
const MODE_KEY = "ako-active-mode";

interface ThemeContextValue {
  /** What the user picked — light / dark / follow the OS. */
  theme: ThemeSetting;
  /** What's actually applied right now. */
  resolvedTheme: ColorScheme;
  setTheme: (theme: ThemeSetting) => void;
  /** True while acting as a Page (orange palette). */
  pageMode: boolean;
  /** Who the page palette belongs to — it must never be shown to anyone else. */
  pageModeOwner: string | null;
  setPageMode: (isPage: boolean, userId?: string | null) => void;
  /** Raw color values for places className can't reach (SVG, navigation, status bar). */
  colors: Palette;
  /** Always true — settings load synchronously. Kept so the splash gate stays trivial. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeSetting {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // storage unavailable — fall through to the default
  }
  return "system";
}

// The launch hint is "page:<userId>" — tagged with whose it is, so a different
// account opened next on this device never inherits the previous account's page
// palette. (A bare legacy "page" has no owner and is dropped once auth resolves —
// see usePageThemeSync.)
function readInitialPageHint(): { pageMode: boolean; owner: string | null } {
  try {
    const raw = localStorage.getItem(MODE_KEY) ?? "";
    if (raw === "page") return { pageMode: true, owner: null };
    if (raw.startsWith("page:")) return { pageMode: true, owner: raw.slice(5) || null };
  } catch {}
  return { pageMode: false, owner: null };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Persisted settings are read synchronously (sqlite-backed localStorage, see
  // lib/polyfills.ts) so the very first frame already has the right palette —
  // no flash of light/personal before the saved choice loads.
  const [theme, setThemeState] = useState<ThemeSetting>(readInitialTheme);
  const [initialHint] = useState(readInitialPageHint);
  const [pageMode, setPageModeState] = useState<boolean>(initialHint.pageMode);
  const [pageModeOwner, setPageModeOwner] = useState<string | null>(initialHint.owner);
  const ready = true;

  const resolvedTheme: ColorScheme =
    theme === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme;

  // Keep native chrome (keyboard, alerts, system sheets) in step with the choice.
  useEffect(() => {
    Appearance.setColorScheme(theme === "system" ? "unspecified" : theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }, []);

  const setPageMode = useCallback((isPage: boolean, userId?: string | null) => {
    setPageModeState(isPage);
    setPageModeOwner(isPage ? userId ?? null : null);
    try {
      localStorage.setItem(MODE_KEY, isPage && userId ? `page:${userId}` : "personal");
    } catch {}
  }, []);

  const colors = useMemo(() => getPalette(resolvedTheme, pageMode), [resolvedTheme, pageMode]);
  const cssVars = useMemo(() => paletteToCssVars(colors), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, pageMode, pageModeOwner, setPageMode, colors, ready }),
    [theme, resolvedTheme, setTheme, pageMode, pageModeOwner, setPageMode, colors, ready]
  );

  return (
    <ThemeContext.Provider value={value}>
      <VariableContextProvider value={cssVars}>
        <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>
      </VariableContextProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
