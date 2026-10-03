// src/lib/formatText.tsx
//
// Shared inline-formatting parser used everywhere user-authored text is
// displayed: post content, project descriptions, comments. Handles:
//   - #hashtag / @mention -> tappable links
//   - *bold* / _italic_ / ~strikethrough~ -> WhatsApp-style typed markers
//   - [u]underline[/u] -> only ever inserted by the FormatToolbar's Underline
//     button, never typed by hand
//
// Single-level only (no nesting of one marker inside another).
//
// Native: returns nested <Text> spans, so call it INSIDE a <Text>. Font weight
// and italics resolve through our Text component (real Inter bold / italic
// files); strikethrough and underline are text decorations.
import { router, type Href } from "expo-router";
import { Fragment, type ReactNode } from "react";

import { MentionLink } from "@/components/post/MentionLink";
import { Text } from "@/components/ui/Text";

const TOKEN_PATTERN = /(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\[u\][^[\]]*\[\/u\])/g;

export function renderFormattedText(text: string, keyPrefix = "f"): ReactNode[] {
  const parts = text.split(TOKEN_PATTERN);

  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;

    if (/^#[a-zA-Z0-9_]+$/.test(part)) {
      const tag = part.slice(1).toLowerCase();
      return (
        <Text key={key} className="text-accent" accessibilityRole="link" onPress={() => router.push(`/hashtag/${tag}` as Href)}>
          {part}
        </Text>
      );
    }

    if (/^@[a-zA-Z0-9_]+$/.test(part)) {
      // Could be a personal profile or a Page — MentionLink resolves which.
      return (
        <MentionLink key={key} username={part.slice(1)}>
          {part}
        </MentionLink>
      );
    }

    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return (
        <Text key={key} className="font-bold">
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return (
        <Text key={key} className="italic">
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.length > 2 && part.startsWith("~") && part.endsWith("~")) {
      return (
        <Text key={key} style={{ textDecorationLine: "line-through" }}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.startsWith("[u]") && part.endsWith("[/u]")) {
      return (
        <Text key={key} style={{ textDecorationLine: "underline" }}>
          {part.slice(3, -4)}
        </Text>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}
