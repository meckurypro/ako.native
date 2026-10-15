// src/components/project/book/BookRichText.tsx
// Renders an authored chapter's Markdown (see lib/bookFormat.ts) for the reflow
// reader: headings, paragraphs, **bold**, *italic*, lists, quotes, dividers.
// Colours and size come from the reader's theme, not the app theme.
import { Fragment, useMemo, type ReactNode } from "react";
import { Platform, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { parseBook, type BookInline } from "@/lib/bookFormat";

interface BookRichTextProps {
  content: string;
  ink: string;
  muted: string;
  fontSize: number;
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

// Nested <Text> inherits colour / size / line height from its parent <Text>, and our
// Text component carries family + weight down, so bold-inside-italic resolves to the
// right font file.
function renderInline(nodes: BookInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.t) {
      case "text":
        return <Fragment key={key}>{n.v}</Fragment>;
      case "bold":
        return (
          <Text key={key} className="font-bold">
            {renderInline(n.c, key)}
          </Text>
        );
      case "italic":
        return (
          <Text key={key} className="italic">
            {renderInline(n.c, key)}
          </Text>
        );
      case "code":
        return (
          <Text key={key} style={{ fontFamily: MONO }}>
            {n.v}
          </Text>
        );
    }
  });
}

export function BookRichText({ content, ink, muted, fontSize }: BookRichTextProps) {
  const blocks = useMemo(() => parseBook(content), [content]);
  const lineHeight = fontSize * 1.625;
  const paraGap = fontSize * 0.9;

  return (
    <View>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.k) {
          case "heading": {
            const size = fontSize + (b.level === 1 ? 6 : b.level === 2 ? 4 : 2);
            return (
              <Text
                key={key}
                selectable
                className="font-semibold"
                style={{ color: ink, fontSize: size, lineHeight: size * 1.3, marginTop: fontSize * 0.9, marginBottom: fontSize * 0.55 }}
              >
                {renderInline(b.inline, key)}
              </Text>
            );
          }
          case "p":
            return (
              <Text key={key} selectable style={{ color: ink, fontSize, lineHeight, marginBottom: paraGap }}>
                {renderInline(b.inline, key)}
              </Text>
            );
          case "list":
            return (
              <View key={key} style={{ marginBottom: paraGap, gap: fontSize * 0.35 }}>
                {b.items.map((item, j) => (
                  <View key={`${key}-${j}`} style={{ flexDirection: "row", paddingLeft: item.depth * fontSize * 1.1 }}>
                    <Text style={{ color: ink, fontSize, lineHeight, width: fontSize * (item.marker.length > 2 ? 2.2 : 1.5) }}>{item.marker}</Text>
                    <Text selectable style={{ flex: 1, color: ink, fontSize, lineHeight }}>
                      {renderInline(item.inline, `${key}-${j}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: muted, paddingLeft: 14, marginBottom: paraGap }}>
                <Text selectable className="italic" style={{ color: muted, fontSize, lineHeight }}>
                  {renderInline(b.inline, key)}
                </Text>
              </View>
            );
          case "code":
            return (
              <View key={key} style={{ marginBottom: paraGap, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: muted }}>
                <Text selectable style={{ color: ink, fontFamily: MONO, fontSize: fontSize - 2, lineHeight: (fontSize - 2) * 1.5 }}>
                  {b.text}
                </Text>
              </View>
            );
          case "hr":
            return <View key={key} style={{ height: 1, backgroundColor: muted, opacity: 0.35, marginVertical: fontSize * 1.1 }} />;
        }
      })}
    </View>
  );
}
