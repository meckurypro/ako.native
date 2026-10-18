// File: src/theme/fonts.ts
// Web loads Fraunces / Inter / Newsreader / Roboto from Google Fonts and lets the
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
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces/400Regular";
import { Fraunces_400Regular_Italic } from "@expo-google-fonts/fraunces/400Regular_Italic";
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_500Medium_Italic } from "@expo-google-fonts/fraunces/500Medium_Italic";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Fraunces_600SemiBold_Italic } from "@expo-google-fonts/fraunces/600SemiBold_Italic";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { Fraunces_700Bold_Italic } from "@expo-google-fonts/fraunces/700Bold_Italic";
import { Fraunces_800ExtraBold } from "@expo-google-fonts/fraunces/800ExtraBold";
import { Fraunces_800ExtraBold_Italic } from "@expo-google-fonts/fraunces/800ExtraBold_Italic";
import { Fraunces_900Black } from "@expo-google-fonts/fraunces/900Black";
import { Fraunces_900Black_Italic } from "@expo-google-fonts/fraunces/900Black_Italic";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { Newsreader_500Medium_Italic } from "@expo-google-fonts/newsreader/500Medium_Italic";
import { Newsreader_600SemiBold } from "@expo-google-fonts/newsreader/600SemiBold";
import { Newsreader_600SemiBold_Italic } from "@expo-google-fonts/newsreader/600SemiBold_Italic";
import { Newsreader_700Bold } from "@expo-google-fonts/newsreader/700Bold";
import { Newsreader_700Bold_Italic } from "@expo-google-fonts/newsreader/700Bold_Italic";
import { Newsreader_800ExtraBold } from "@expo-google-fonts/newsreader/800ExtraBold";
import { Newsreader_800ExtraBold_Italic } from "@expo-google-fonts/newsreader/800ExtraBold_Italic";
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
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_800ExtraBold,
  Fraunces_900Black,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold_Italic,
  Fraunces_800ExtraBold_Italic,
  Fraunces_900Black_Italic,
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
  Newsreader_700Bold,
  Newsreader_800ExtraBold,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold_Italic,
  Newsreader_700Bold_Italic,
  Newsreader_800ExtraBold_Italic,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
};

export type FontFamilyKey = "body" | "display" | "simple" | "reading";
export type FontWeightKey = 400 | 500 | 600 | 700 | 800 | 900;

const FAMILY_PREFIX: Record<FontFamilyKey, string> = {
  body: "Inter",
  display: "Fraunces",
  simple: "Roboto",
  reading: "Newsreader",
};

const WEIGHT_SUFFIX: Record<FontWeightKey, string> = {
  400: "400Regular",
  500: "500Medium",
  600: "600SemiBold",
  700: "700Bold",
  800: "800ExtraBold",
  900: "900Black",
};

// Weights that actually exist per family. Inter, Fraunces and Newsreader ship real italics.
const AVAILABLE: Record<FontFamilyKey, FontWeightKey[]> = {
  body: [400, 500, 600, 700],
  display: [400, 500, 600, 700, 800, 900],
  simple: [400, 500, 600, 700],
  reading: [400, 500, 600, 700, 800],
};
const ITALIC_AVAILABLE: Record<FontFamilyKey, FontWeightKey[]> = {
  body: [400, 500, 600, 700],
  display: [400, 500, 600, 700, 800, 900],
  simple: [],
  reading: [400, 500, 600, 700, 800],
};
// Families that ship real italic files (Roboto doesn't; it falls back to the platform slant).
const ITALIC_FAMILIES = new Set<FontFamilyKey>(["display", "body", "reading"]);

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
  if (italic && ITALIC_FAMILIES.has(family) && ITALIC_AVAILABLE[family].includes(w)) {
    return `${FAMILY_PREFIX[family]}_${WEIGHT_SUFFIX[w]}_Italic`;
  }
  return `${FAMILY_PREFIX[family]}_${WEIGHT_SUFFIX[w]}`;
}
