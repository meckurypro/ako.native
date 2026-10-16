// src/components/project/book/BookRichText.tsx
// Renders an authored chapter's Markdown (see lib/bookFormat.ts) for the reflow
// reader: headings, paragraphs, **bold**, *italic*, links, lists, quotes, code (with Copy), dividers.
// Colours and size come from the reader's theme, not the app theme.
//
// Optional typography props (family, lineHeight, justify, heavy, ornament) back the
// reader's Themes & Settings; with none given it renders exactly as before.
import * as Clipboard from "expo-clipboard";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, Text as RNText, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { parseBook, type BookBlock, type BookInline } from "@/lib/bookFormat";
import { openExternal } from "@/lib/openExternal";

export type BookFamily = "body" | "display" | "serif";

interface BookRichTextProps {
  /** Markdown source. Ignored when `blocks` is given (the reader pre-parses to lift the chapter heading out). */
  content?: string;
  blocks?: BookBlock[];
  ink: string;
  muted: string;
  /** Link colour (the reader theme's accent). Falls back to the text colour. */
  accent?: string;
  /** Called when a link or Copy button is pressed, so the reader can ignore that tap (it would toggle the chrome). */
  onInteract?: () => void;
  fontSize: number;
  /** "body" = Inter, "display" = Playfair (both bundled), "serif" = the platform serif. Default "body". */
  family?: BookFamily;
  /** Line height as a multiple of font size. */
  lineHeight?: number;
  justify?: boolean;
  /** "Bold" theme: heavier body + bold weights. */
  heavy?: boolean;
  /** Render `---` as a small centred ornament instead of a hairline. */
  ornament?: boolean;
  /**
   * Reports the gaps between blocks (y from the top of the parent column) as they lay out, so the reader
   * can seat its page dividers between paragraphs instead of through a line of text.
   */
  onGaps?: (gaps: number[]) => void;
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
export const SYSTEM_SERIF = Platform.select({ ios: "Georgia", default: "serif" });

// "body" / "display" go through our Text (bundled font files per weight); "serif" has no bundled
// files, so it uses the platform serif and expresses weight / slant with fontWeight / fontStyle.
export interface Face {
  family: BookFamily;
  heavy: boolean;
}

export function Span({ face, kind, style, children, ...rest }: { face: Face; kind?: "bold" | "italic" | "semibold"; style?: StyleProp<TextStyle>; children?: ReactNode; selectable?: boolean }) {
  if (face.family === "serif") {
    const weight: TextStyle["fontWeight"] = kind === "bold" ? "700" : kind === "semibold" ? "600" : face.heavy ? "600" : "400";
    return (
      <RNText {...rest} style={[{ fontFamily: SYSTEM_SERIF, fontWeight: weight, fontStyle: kind === "italic" ? "italic" : "normal" }, style]}>
        {children}
      </RNText>
    );
  }
  const fam = face.family === "display" ? "font-display" : "font-body";
  const cls = kind === "bold" ? "font-bold" : kind === "semibold" ? "font-semibold" : kind === "italic" ? "italic" : face.heavy ? "font-semibold" : "";
  return (
    <Text {...rest} className={`${fam} ${cls}`.trim()} style={style}>
      {children}
    </Text>
  );
}

// Nested spans inherit colour / size / line height from their parent, and Text carries
// family + weight down, so bold-inside-italic resolves to the right font file.
type OpenLink = (href: string) => void;

/** A fenced code block with a Copy button: the book is full of commands people paste into a terminal. */
function CodeBlock({ text, ink, muted, fontSize, paraGap, onInteract }: { text: string; ink: string; muted: string; fontSize: number; paraGap: number; onInteract?: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    onInteract?.();
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard unavailable: the text is still selectable. */
    }
  }
  return (
    <View style={{ marginBottom: paraGap, borderRadius: 10, borderWidth: 1, borderColor: muted, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingTop: 6 }}>
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          hitSlop={8}
          style={{ borderRadius: 6, borderWidth: 1, borderColor: muted, paddingHorizontal: 8, paddingVertical: 3 }}
        >
          <RNText style={{ color: muted, fontSize: 12 }}>{copied ? "Copied" : "Copy"}</RNText>
        </Pressable>
      </View>
      <RNText selectable style={{ color: ink, fontFamily: MONO, fontSize: fontSize - 2, lineHeight: (fontSize - 2) * 1.5, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 }}>
        {text}
      </RNText>
    </View>
  );
}

function renderInline(nodes: BookInline[], keyPrefix: string, face: Face, accent: string | undefined, openLink: OpenLink): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.t) {
      case "text":
        return <Fragment key={key}>{n.v}</Fragment>;
      case "bold":
        return (
          <Span key={key} face={face} kind="bold">
            {renderInline(n.c, key, face, accent, openLink)}
          </Span>
        );
      case "italic":
        return (
          <Span key={key} face={face} kind="italic">
            {renderInline(n.c, key, face, accent, openLink)}
          </Span>
        );
      case "link":
        // The parser only emits http(s) links.
        return (
          <RNText key={key} onPress={() => openLink(n.href)} accessibilityRole="link" style={{ color: accent, textDecorationLine: "underline" }}>
            {renderInline(n.c, key, face, accent, openLink)}
          </RNText>
        );
      case "code":
        return (
          <RNText key={key} style={{ fontFamily: MONO }}>
            {n.v}
          </RNText>
        );
    }
  });
}

export function BookRichText({
  content,
  blocks: given,
  ink,
  muted,
  accent,
  onInteract,
  fontSize,
  family = "body",
  lineHeight: lineMultiple = 1.625,
  justify = false,
  heavy = false,
  ornament = false,
  onGaps,
}: BookRichTextProps) {
  const blocks = useMemo(() => given ?? parseBook(content ?? ""), [given, content]);
  const lineHeight = fontSize * lineMultiple;
  const paraGap = fontSize * 0.9;
  const face: Face = { family, heavy };
  const align: TextStyle = justify ? { textAlign: "justify" } : {};
  const openLink: OpenLink = (href) => {
    onInteract?.();
    void openExternal(href);
  };

  // Block layouts, coalesced into a single report per layout pass.
  const rootY = useRef(0);
  const spans = useRef<Record<number, { y: number; h: number }>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    []
  );
  const reportGaps = () => {
    if (!onGaps || flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const laid = spans.current;
      if (Object.keys(laid).length < blocks.length) return;
      // The visible gap is the bottom margin of a block: the line goes through its middle.
      onGaps(blocks.slice(0, -1).map((_, i) => rootY.current + laid[i].y + laid[i].h - paraGap / 2));
    }, 0);
  };
  const track = (i: number, node: ReactNode) =>
    onGaps ? (
      <View
        key={`w${i}`}
        onLayout={(e: LayoutChangeEvent) => {
          spans.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
          reportGaps();
        }}
      >
        {node}
      </View>
    ) : (
      node
    );

  return (
    <View onLayout={(e: LayoutChangeEvent) => (rootY.current = e.nativeEvent.layout.y)}>
      {blocks.map((b, i) => track(i, ((): ReactNode => {
        const key = `b${i}`;
        switch (b.k) {
          case "heading": {
            const size = fontSize + (b.level === 1 ? 6 : b.level === 2 ? 4 : 2);
            return (
              <Span
                key={key}
                face={face}
                kind="semibold"
                selectable
                style={{ color: ink, fontSize: size, lineHeight: size * 1.3, marginTop: fontSize * 0.9, marginBottom: fontSize * 0.55 }}
              >
                {renderInline(b.inline, key, face, accent, openLink)}
              </Span>
            );
          }
          case "p":
            return (
              <Span key={key} face={face} selectable style={[{ color: ink, fontSize, lineHeight, marginBottom: paraGap }, align]}>
                {renderInline(b.inline, key, face, accent, openLink)}
              </Span>
            );
          case "list":
            return (
              <View key={key} style={{ marginBottom: paraGap, gap: fontSize * 0.35 }}>
                {b.items.map((item, j) => (
                  <View key={`${key}-${j}`} style={{ flexDirection: "row", paddingLeft: item.depth * fontSize * 1.1 }}>
                    <Span face={face} style={{ color: ink, fontSize, lineHeight, width: fontSize * (item.marker.length > 2 ? 2.2 : 1.5) }}>
                      {item.marker}
                    </Span>
                    <Span face={face} selectable style={{ flex: 1, color: ink, fontSize, lineHeight }}>
                      {renderInline(item.inline, `${key}-${j}`, face, accent, openLink)}
                    </Span>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: muted, paddingLeft: 14, marginBottom: paraGap }}>
                <Span face={face} kind="italic" selectable style={{ color: muted, fontSize, lineHeight }}>
                  {renderInline(b.inline, key, face, accent, openLink)}
                </Span>
              </View>
            );
          case "code":
            return (
              <CodeBlock key={key} text={b.text} ink={ink} muted={muted} fontSize={fontSize} paraGap={paraGap} onInteract={onInteract} />
            );
          case "hr":
            return ornament ? (
              <View key={key} style={{ alignItems: "center", marginVertical: fontSize * 1.3 }}>
                <Ornament color={muted} />
              </View>
            ) : (
              <View key={key} style={{ height: 1, backgroundColor: muted, opacity: 0.35, marginVertical: fontSize * 1.1 }} />
            );
        }
      })()))}
    </View>
  );
}

/** Line, diamond, line: the reader's divider (also used by the chapter opener and end-of-chapter). */
export function Ornament({ color, width = 84 }: { color: string; width?: number }) {
  const side = Math.round(width * 0.39);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", width, justifyContent: "space-between" }}>
      <View style={{ width: side, height: 1, backgroundColor: color, opacity: 0.55 }} />
      <View style={{ width: 7, height: 7, backgroundColor: color, opacity: 0.7, transform: [{ rotate: "45deg" }] }} />
      <View style={{ width: side, height: 1, backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
}
