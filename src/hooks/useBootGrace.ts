// src/hooks/useBootGrace.ts
// True once `budgetMs` has passed since the app launched. The launch gates (splash, account check, onboarding
// check) use it so that a network that never answers can delay the app by seconds, not forever. Measured from app
// start (module load), so every gate shares one clock instead of each starting its own.
import { useEffect, useState } from "react";

import { remainingMs } from "@/lib/offlineBoot";

const BOOT_AT = Date.now();

export function useBootGrace(budgetMs = 4000): boolean {
  const [over, setOver] = useState(() => remainingMs(BOOT_AT, budgetMs) === 0);
  useEffect(() => {
    if (over) return;
    const t = setTimeout(() => setOver(true), remainingMs(BOOT_AT, budgetMs));
    return () => clearTimeout(t);
  }, [over, budgetMs]);
  return over;
}
