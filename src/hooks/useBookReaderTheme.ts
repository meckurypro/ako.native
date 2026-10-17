// src/hooks/useBookReaderTheme.ts
//
// The reader OPENS in the app's resolved light/dark until the reader picks a theme. An explicit
// pick is remembered (localStorage) and used from then on, until they pick again. Only a pick is
// stored, never the default, so a person who never chooses keeps following the app's light/dark.
// This one speaks the Apple Books-style theme ids (Original, Quiet, Paper, Bold, Calm, Focus).
import { useCallback, useState } from "react";

import { defaultThemeFor, READER_STORAGE, READER_THEME_ORDER, type ReaderThemeId } from "@/lib/bookReaderTheme";
import { useTheme } from "@/theme/ThemeProvider";

function readPick(): ReaderThemeId | null {
  try {
    const v = localStorage.getItem(READER_STORAGE.theme);
    return READER_THEME_ORDER.includes(v as ReaderThemeId) ? (v as ReaderThemeId) : null;
  } catch {
    return null;
  }
}

export function useBookReaderTheme(): [ReaderThemeId, (theme: ReaderThemeId) => void] {
  const { resolvedTheme } = useTheme();
  const [picked, setPicked] = useState<ReaderThemeId | null>(readPick);
  const pick = useCallback((theme: ReaderThemeId) => {
    setPicked(theme);
    try {
      localStorage.setItem(READER_STORAGE.theme, theme);
    } catch {
      /* storage unavailable: the pick just lasts for this session */
    }
  }, []);
  return [picked ?? defaultThemeFor(resolvedTheme === "dark"), pick];
}
