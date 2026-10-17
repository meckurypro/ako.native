// src/hooks/useReaderTheme.ts
//
// The book readers offer their own light / sepia / dark themes. A reader OPENS in the app's
// resolved theme until the person picks one; an explicit pick is then remembered and used until
// they pick again. Only picks are stored (never the default), so someone who never chooses keeps
// following the app's light/dark.
import { useCallback, useState } from "react";

import { READER_STORAGE } from "@/lib/bookReaderTheme";
import { useTheme } from "@/theme/ThemeProvider";

export type ReaderTheme = "light" | "sepia" | "dark";

function readPick(): ReaderTheme | null {
  try {
    const v = localStorage.getItem(READER_STORAGE.pdfTheme);
    return v === "light" || v === "sepia" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function useReaderTheme(): [ReaderTheme, (theme: ReaderTheme) => void] {
  const { resolvedTheme } = useTheme();
  const [picked, setPicked] = useState<ReaderTheme | null>(readPick);
  const pick = useCallback((theme: ReaderTheme) => {
    setPicked(theme);
    try {
      localStorage.setItem(READER_STORAGE.pdfTheme, theme);
    } catch {
      /* storage unavailable: the pick just lasts for this session */
    }
  }, []);
  const theme: ReaderTheme = picked ?? (resolvedTheme === "dark" ? "dark" : "light");
  return [theme, pick];
}
