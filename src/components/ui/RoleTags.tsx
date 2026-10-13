// src/components/ui/RoleTags.tsx
import type { ProfileRole } from "@/types/database";
import { Text } from "./Text";

export function RoleTags({ roles, className, numberOfLines }: { roles: ProfileRole[]; className?: string; numberOfLines?: number }) {
  if (!roles || roles.length === 0) return null;
  const sorted = [...roles].sort((a, b) => a.position - b.position);
  // includeFontPadding off (a style in RN 0.86, not a prop): Android adds invisible top/bottom padding to every line otherwise (web has none).
  return <Text className={className} numberOfLines={numberOfLines} style={{ includeFontPadding: false }}>{sorted.map((r) => r.label).join(" · ")}</Text>;
}
