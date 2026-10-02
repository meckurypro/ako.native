/** Returns display_name if set, falls back to @username. */
export function displayName(profile: {
  display_name?: string | null;
  username: string;
}): string {
  return profile.display_name?.trim() || profile.username;
}

/** Truncates a display_name string for compact UI slots (avatars, cards, etc.). */
export function shortDisplayName(
  name: string | null | undefined,
  maxLength = 20
): string {
  const n = name?.trim() || "";
  return n.length > maxLength ? n.slice(0, maxLength).trimEnd() + "…" : n;
}
