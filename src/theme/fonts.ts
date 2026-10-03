// File: src/theme/fonts.ts
// Web loads Playfair Display / Inter / Roboto from Google Fonts and lets the
// browser pick the weight. React Native needs one registered font per weight,
// so this module registers them and maps (family, weight, italic) -> name.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_500Medium_Italic } from "@expo-google-fonts/inter/500Medium_Italic";
import { Inter_600SemiBold_Italic } from "@expo-google-fonts/inter/600SemiBold_Italic";
import { Inter_700Bold_Italic } from "@expo-google-fonts/inter/700Bold_Italic";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PlayfairDisplay_400Regular } from "@expo-google-fonts/playfair-display/400Regular";
import { PlayfairDisplay_400Regular_Italic } from "@expo-google-fonts/playfair-display/400Regular_Italic";
import { PlayfairDisplay_500Medium } from "@expo-google-fonts/playfair-display/500Medium";
import { PlayfairDisplay_500Medium_Italic } from "@expo-google-fonts/playfair-display/500Medium_Italic";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { PlayfairDisplay_600SemiBold_Italic } from "@expo-google-fonts/playfair-display/600SemiBold_Italic";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { PlayfairDisplay_700Bold_Italic } from "@expo-google-fonts/playfair-display/700Bold_Italic";
import { PlayfairDisplay_800ExtraBold } from "@expo-google-fonts/playfair-display/800ExtraBold";
import { PlayfairDisplay_900Black } from "@expo-google-fonts/playfair-display/900Black";
import { Roboto_400Regular } from "@expo-google-fonts/roboto/400Regular";
import { Roboto_500Medium } from "@expo-google-fonts/roboto/500Medium";
import { Roboto_600SemiBold } from "@expo-google-fonts/roboto/600SemiBold";
import { Roboto_700Bold } from "@expo-google-fonts/roboto/700Bold";

export const fontAssets = {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium_Italic,
  Inter_600SemiBold_Italic,
  Inter_700Bold_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
  PlayfairDisplay_800ExtraBold,
  PlayfairDisplay_900Black,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
};

export type FontFamilyKey = "body" | "display" | "simple";
export type FontWeightKey = 400 | 500 | 600 | 700 | 800 | 900;

const FAMILY_PREFIX: Record<FontFamilyKey, string> = {
  body: "Inter",
  display: "PlayfairDisplay",
  simple: "Roboto",
};

const WEIGHT_SUFFIX: Record<FontWeightKey, string> = {
  400: "400Regular",
  500: "500Medium",
  600: "600SemiBold",
  700: "700Bold",
  800: "800ExtraBold",
  900: "900Black",
};

// Weights that actually exist per family (italic is Playfair-only, 400-700).
const AVAILABLE: Record<FontFamilyKey, FontWeightKey[]> = {
  body: [400, 500, 600, 700],
  display: [400, 500, 600, 700, 800, 900],
  simple: [400, 500, 600, 700],
};
const ITALIC_AVAILABLE: FontWeightKey[] = [400, 500, 600, 700];
// Families that ship real italic files (Roboto doesn't; it falls back to the platform slant).
const ITALIC_FAMILIES = new Set<FontFamilyKey>(["display", "body"]);

/** Snap a requested weight to the nearest weight the family ships. */
function snap(family: FontFamilyKey, weight: FontWeightKey): FontWeightKey {
  const list = AVAILABLE[family];
  return list.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), list[0]);
}

export function resolveFontFamily(
  family: FontFamilyKey = "body",
  weight: FontWeightKey = 400,
  italic = false
): string {
  const w = snap(family, weight);
  if (italic && ITALIC_FAMILIES.has(family) && ITALIC_AVAILABLE.includes(w)) {
    return `${FAMILY_PREFIX[family]}_${WEIGHT_SUFFIX[w]}_Italic`;
  }
  return `${FAMILY_PREFIX[family]}_${WEIGHT_SUFFIX[w]}`;
}
