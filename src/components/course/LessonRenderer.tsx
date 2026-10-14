// src/components/course/LessonRenderer.tsx
// Renders a lesson's text as a warm, scannable reading page: tinted section cards (🎯 GOAL, ✅ CHECKPOINT,
// 🔧 WHEN IT BREAKS …), numbered step lists, copyable code blocks and inline code/link chips.
// Parsing lives in lib/lessonFormat (pure, shared with web).
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Square } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { haptics } from "@/lib/haptics";
import { parseLesson, type Block, type Inline, type ListItem, type Tone } from "@/lib/lessonFormat";
import { MONO_FONT } from "@/theme/mono";
import { useTheme } from "@/theme/ThemeProvider";

const TONE: Record<Tone, { bar: string; card: string; head: string }> = {
  goal: { bar: "bg-accent", card: "bg-accent-a12", head: "text-accent" },
  success: { bar: "bg-accent", card: "bg-accent-soft", head: "text-accent" },
  warn: { bar: "bg-pushback", card: "bg-pushback-a10", head: "text-pushback" },
  danger: { bar: "bg-danger", card: "bg-danger-a10", head: "text-danger" },
  tip: { bar: "bg-accent-a60", card: "bg-surface", head: "text-ink" },
  plain: { bar: "bg-border", card: "bg-surface", head: "text-ink" },
};

const BODY = { fontSize: 15, lineHeight: 24 } as const;

function openLink(href: string) {
  Linking.openURL(href).catch(() => {});
}

function Inlines({ parts, muted = false }: { parts: Inline[]; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "text") return p.v;
        if (p.t === "bold") {
          return (
            <Text key={i} className="font-semibold text-ink">
              {p.v}
            </Text>
          );
        }
        if (p.t === "code") {
          return (
            <Text key={i} className="text-ink" style={{ fontFamily: MONO_FONT, fontSize: 13.5, backgroundColor: colors.accentSoft }}>
              {` ${p.v} `}
            </Text>
          );
        }
        return (
          <Text key={i} className={muted ? "text-ink-muted underline" : "text-accent underline"} onPress={() => openLink(p.href)}>
            {p.v}
          </Text>
        );
      })}
    </>
  );
}

function Para({ parts, className = "text-ink" }: { parts: Inline[]; className?: string }) {
  return (
    <Text selectable className={className} style={BODY}>
      <Inlines parts={parts} />
    </Text>
  );
}

function CodeBlock({ text }: { text: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await Clipboard.setStringAsync(text);
      haptics.light();
      setCopied(true);
      toast("Copied", { variant: "success" });
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn't copy that.", { variant: "error" });
    }
  }

  return (
    <View className="overflow-hidden rounded-xl border border-border bg-ink-a10">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 14, paddingRight: 52, paddingVertical: 12 }}>
        <Text selectable className="text-ink" style={{ fontFamily: MONO_FONT, fontSize: 12.5, lineHeight: 19 }}>
          {text}
        </Text>
      </ScrollView>
      <Pressable
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={copied ? "Copied" : "Copy code"}
        hitSlop={8}
        className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-surface"
      >
        <Icon as={copied ? Check : Copy} size={15} className={copied ? "text-accent" : "text-ink-muted"} />
      </Pressable>
    </View>
  );
}

function Marker({ item }: { item: ListItem }) {
  const m = item.marker;
  if (m.kind === "dot") return <View className="mt-[10px] h-1.5 w-1.5 rounded-full bg-accent" />;
  if (m.kind === "emoji") return <Text style={{ fontSize: 15, lineHeight: 24 }}>{m.v}</Text>;
  if (m.kind === "check") return <Icon as={Square} size={17} className="mt-[3px] text-ink-muted" />;
  const label = m.kind === "num" ? m.n : m.v;
  return (
    <View className="mt-[1px] h-6 w-6 items-center justify-center rounded-full bg-accent-a15">
      <Text className="text-xs font-bold text-accent">{label}</Text>
    </View>
  );
}

function ListView({ items }: { items: ListItem[] }) {
  return (
    <View className="gap-2.5">
      {items.map((item, i) => (
        <View key={i} className="flex-row gap-3">
          <View className="w-6 items-center">
            <Marker item={item} />
          </View>
          <View className="min-w-0 flex-1 gap-2">
            <Para parts={item.inline} />
            {item.extra.map((b, j) => (
              <BlockView key={j} block={b} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.k) {
    case "p":
      return <Para parts={block.inline} />;
    case "list":
      return <ListView items={block.items} />;
    case "code":
      return <CodeBlock text={block.text} />;
    case "hr":
      return <View className="my-1 h-px bg-border" />;
    case "heading":
      return (
        <Text selectable className="mt-1 font-display font-bold text-ink" style={{ fontSize: block.level === 1 ? 22 : block.level === 2 ? 19 : 16, lineHeight: block.level === 1 ? 28 : 24 }}>
          <Inlines parts={block.inline} />
        </Text>
      );
    case "note":
      return (
        <View className="flex-row overflow-hidden rounded-xl bg-accent-a12">
          <View className="w-1 bg-accent" />
          <View className="min-w-0 flex-1 px-3 py-2.5">
            <Para parts={block.inline} />
          </View>
        </View>
      );
    case "section": {
      const t = TONE[block.tone];
      return (
        <View className={`flex-row overflow-hidden rounded-2xl border border-border ${t.card}`}>
          <View className={`w-1 ${t.bar}`} />
          <View className="min-w-0 flex-1 px-4 pb-4 pt-3.5">
            <View className="mb-2.5 flex-row items-center gap-2">
              <Text style={{ fontSize: 16 }}>{block.emoji}</Text>
              <Text className={`flex-1 text-[11.5px] font-bold uppercase ${t.head}`} style={{ letterSpacing: 0.9 }}>
                {block.title}
              </Text>
            </View>
            <View className="gap-3">
              {block.blocks.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </View>
          </View>
        </View>
      );
    }
  }
}

export const LessonRenderer = memo(function LessonRenderer({ content }: { content: string }) {
  const parsed = useMemo(() => parseLesson(content), [content]);
  return (
    <View className="gap-3.5">
      {parsed.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
});
