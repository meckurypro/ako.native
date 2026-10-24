// src/components/project-types/SongGigField.tsx
// The "Gig" field on a song (a Media project). Every song lives under one of the owner's artist gigs, so this is
// required. A musician with no gig yet gets "New gig" pre-selected: saving scaffolds their Music Artist gig, which
// they can set up properly later (see useEnsureArtistGig).
import { useEffect } from "react";
import { View } from "react-native";

import { SelectField } from "@/components/ui/SelectField";
import { Text } from "@/components/ui/Text";
import { useArtistGigs } from "@/hooks/usePortfolio";

/** Stands in for "scaffold a Music Artist gig on save". Anything else in `value` is a real gig id. */
export const NEW_ARTIST_GIG = "new";

interface SongGigFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function SongGigField({ value, onChange }: SongGigFieldProps) {
  const { data: gigs, isLoading } = useArtistGigs();
  // They only ever get one Music Artist gig (find_or_create_role_gig reuses it), so only offer a new one if missing.
  const hasMusicArtistGig = gigs.some((g) => g.role_label === "Music Artist");

  // Settle on a default once the list has loaded: their first gig, else a new one.
  useEffect(() => {
    if (isLoading || value) return;
    onChange(gigs[0]?.id ?? NEW_ARTIST_GIG);
  }, [isLoading, value, gigs, onChange]);

  const options = [
    ...gigs.map((g) => ({
      value: g.id,
      label: g.role_label && g.role_label !== g.title ? `${g.title} · ${g.role_label}` : g.title,
    })),
    ...(hasMusicArtistGig ? [] : [{ value: NEW_ARTIST_GIG, label: "New gig · Music Artist" }]),
  ];

  return (
    <View>
      <SelectField label="Gig" value={value} options={options} onChange={onChange} placeholder="Pick a gig" />
      {value === NEW_ARTIST_GIG ? <Text className="mt-1.5 text-xs text-ink-muted">Set it up later.</Text> : null}
    </View>
  );
}
