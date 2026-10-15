// src/hooks/useReaderTheme.ts
//
// The book readers offer their own light / sepia / dark themes, but a reader must
// OPEN in whatever the app is set to: dark app → dark page, light app → light page.
//
// So the reader theme is just "the person's in-reader pick, if any, else the app's
// resolved theme". The pick is deliberately session-only (component state, nothing
// persisted): the old code wrote its default ("light") to storage on first mount,
// which silently turned the default into a permanent choice and ignored the app
// theme from then on. Changing the app theme while reading follows along until the
// reader picks one explicitly.
import { useState } from "react";

import { useTheme } from "@/theme/ThemeProvider";

export type ReaderTheme = "light" | "sepia" | "dark";

export function useReaderTheme(): [ReaderTheme, (theme: ReaderTheme) => void] {
  const { resolvedTheme } = useTheme();
  const [picked, setPicked] = useState<ReaderTheme | null>(null);
  const theme: ReaderTheme = picked ?? (resolvedTheme === "dark" ? "dark" : "light");
  return [theme, setPicked];
}
