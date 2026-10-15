// src/hooks/useBookReaderTheme.ts
//
// Same rule as hooks/useReaderTheme.ts: the reader OPENS in the app's resolved light/dark,
// and an in-reader pick lasts for this reading session only, nothing is persisted.
// This one speaks the Apple Books-style theme ids (Original, Quiet, Paper, Bold, Calm, Focus).
import { useState } from "react";

import { defaultThemeFor, type ReaderThemeId } from "@/lib/bookReaderTheme";
import { useTheme } from "@/theme/ThemeProvider";

export function useBookReaderTheme(): [ReaderThemeId, (theme: ReaderThemeId) => void] {
  const { resolvedTheme } = useTheme();
  const [picked, setPicked] = useState<ReaderThemeId | null>(null);
  return [picked ?? defaultThemeFor(resolvedTheme === "dark"), setPicked];
}
