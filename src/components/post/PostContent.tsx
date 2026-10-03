// src/components/post/PostContent.tsx
// Heading (optional, selectable colour) + body paragraphs. A heading with no
// body renders as ordinary body text — only a heading that has a body under
// it gets the large title treatment.
import { View } from "react-native";

import { Text } from "@/components/ui/Text";
import { getHeadingColorDef } from "@/lib/headingColors";
import { renderFormattedText } from "@/lib/formatText";
import type { Palette } from "@/theme/palettes";
import { useTheme } from "@/theme/ThemeProvider";

interface PostContentProps {
  heading?: string | null;
  headingColor?: string | null;
  content: string;
}

/** "sapphire" is the default heading colour (= post-header); the rest are palette tokens. */
export function headingColorValue(key: string | null | undefined, colors: Palette): string | undefined {
  const def = getHeadingColorDef(key);
  if (!def) return undefined;
  switch (def.key) {
    case "emerald":
      return colors.headingEmerald;
    case "amber":
      return colors.headingAmber;
    case "garnet":
      return colors.headingGarnet;
    case "amethyst":
      return colors.headingAmethyst;
    case "petrol":
      return colors.headingPetrol;
    case "espresso":
      return colors.headingEspresso;
    case "graphite":
      return colors.headingGraphite;
    default:
      return undefined; // sapphire → falls back to text-post-header
  }
}

/** Swatch colour for the picker: like headingColorValue, but sapphire resolves to the default heading colour. */
export function headingSwatchColor(key: string, colors: Palette): string {
  return headingColorValue(key, colors) ?? colors.postHeader;
}

function Paragraphs({ content }: { content: string }) {
  const paragraphs = content.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((para, i) => (
        <Text key={i} className={`text-[15px] leading-[24px] text-ink ${i < paragraphs.length - 1 ? "mb-3" : ""}`}>
          {renderFormattedText(para, `p${i}`)}
        </Text>
      ))}
    </>
  );
}

export function PostContent({ heading, headingColor, content }: PostContentProps) {
  const { colors } = useTheme();
  const hasBody = content.trim() !== "";

  if (heading && !hasBody) {
    return (
      <View>
        <Paragraphs content={heading} />
      </View>
    );
  }

  const color = headingColorValue(headingColor, colors);

  return (
    <View>
      {heading ? (
        <Text className="mb-3 font-simple text-[26px] font-semibold leading-[30px] text-post-header" style={color ? { color } : undefined}>
          {renderFormattedText(heading, "h")}
        </Text>
      ) : null}
      {hasBody ? <Paragraphs content={content} /> : null}
    </View>
  );
}
