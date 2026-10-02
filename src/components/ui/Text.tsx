// File: src/components/ui/Text.tsx
// Drop-in replacement for react-native's Text that understands the web app's
// font utility classes. The web resolves `font-display font-semibold` through
// CSS; React Native needs an explicit font file per weight, so this component
// reads the font-* / italic classes from className, picks the matching
// registered font, and passes the rest of className through untouched.
//
// ALWAYS import Text from here (or "@/components/ui"), never from
// react-native — otherwise the app falls back to the system font.
import { createContext, useContext, type ComponentProps } from "react";
import { Text as RNText } from "react-native";

import {
  resolveFontFamily,
  type FontFamilyKey,
  type FontWeightKey,
} from "@/theme/fonts";

const FAMILY_CLASS: Record<string, FontFamilyKey> = {
  "font-display": "display",
  "font-body": "body",
  "font-simple": "simple",
};

const WEIGHT_CLASS: Record<string, FontWeightKey> = {
  "font-thin": 400,
  "font-extralight": 400,
  "font-light": 400,
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
  "font-bold": 700,
  "font-extrabold": 800,
  "font-black": 900,
};

interface InheritedFont {
  family: FontFamilyKey;
  weight: FontWeightKey;
}
// Nested <Text> spans inherit the parent's family/weight, like CSS does.
const InheritedFontContext = createContext<InheritedFont>({ family: "body", weight: 400 });

export type TextProps = ComponentProps<typeof RNText> & { className?: string };

export function Text({ className, style, children, ...rest }: TextProps) {
  const inherited = useContext(InheritedFontContext);

  let family = inherited.family;
  let weight = inherited.weight;
  let italic = false;
  const kept: string[] = [];

  for (const token of (className ?? "").split(/\s+/).filter(Boolean)) {
    if (token in FAMILY_CLASS) family = FAMILY_CLASS[token];
    else if (token in WEIGHT_CLASS) weight = WEIGHT_CLASS[token];
    else if (token === "italic") italic = true;
    else kept.push(token);
  }

  // Playfair ships real italics; for other families keep the italic class so
  // the platform's synthetic slant applies.
  const hasRealItalic = italic && family === "display";
  if (italic && !hasRealItalic) kept.push("italic");

  const fontFamily = resolveFontFamily(family, weight, hasRealItalic);

  return (
    <InheritedFontContext.Provider value={{ family, weight }}>
      <RNText
        {...rest}
        className={kept.join(" ")}
        style={[{ fontFamily }, style]}
      >
        {children}
      </RNText>
    </InheritedFontContext.Provider>
  );
}
