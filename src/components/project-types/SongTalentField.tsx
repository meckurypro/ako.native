// src/components/project-types/SongTalentField.tsx
// The "Talent" field on a song (a Media project). Every song lives under one of the owner's artist talents, so this is
// required. A musician with no talent yet gets "New talent" pre-selected: saving scaffolds their Music Artist talent, which
// they can set up properly later (see useEnsureArtistTalent).
import { useEffect } from "react";
import { View } from "react-native";

import { SelectField } from "@/components/ui/SelectField";
import { Text } from "@/components/ui/Text";
import { useArtistTalents } from "@/hooks/usePortfolio";

/** Stands in for "scaffold a Music Artist talent on save". Anything else in `value` is a real talent id. */
export const NEW_ARTIST_TALENT = "new";

interface SongTalentFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function SongTalentField({ value, onChange }: SongTalentFieldProps) {
  const { data: talents, isLoading } = useArtistTalents();
  // They only ever get one Music Artist talent (find_or_create_role_gig reuses it), so only offer a new one if missing.
  const hasMusicArtistTalent = talents.some((g) => g.role_label === "Music Artist");

  // Settle on a default once the list has loaded: their first talent, else a new one.
  useEffect(() => {
    if (isLoading || value) return;
    onChange(talents[0]?.id ?? NEW_ARTIST_TALENT);
  }, [isLoading, value, talents, onChange]);

  const options = [
    ...talents.map((g) => ({
      value: g.id,
      label: g.role_label && g.role_label !== g.title ? `${g.title} · ${g.role_label}` : g.title,
    })),
    ...(hasMusicArtistTalent ? [] : [{ value: NEW_ARTIST_TALENT, label: "New talent · Music Artist" }]),
  ];

  return (
    <View>
      <SelectField label="Talent" value={value} options={options} onChange={onChange} placeholder="Pick a talent" />
      {value === NEW_ARTIST_TALENT ? <Text className="mt-1.5 text-xs text-ink-muted">Set it up later.</Text> : null}
    </View>
  );
}
