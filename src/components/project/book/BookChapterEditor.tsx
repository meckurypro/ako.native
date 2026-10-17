// src/components/project/book/BookChapterEditor.tsx
// The creator's chapter editor: a formatting toolbar over the text box, plus a Preview tab that renders the
// chapter exactly as the reader will (same parser, same block renderer, same Copy button on code blocks).
// Everything the reader can display is one tap away; the text underneath stays plain Markdown.
import { Bold, Code, FileCode, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Minus, Quote, Table as TableIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { BOOK_SECTION_INFO, type BookChapterKind } from "@/hooks/useBookBuilder";
import { useBookReaderTheme } from "@/hooks/useBookReaderTheme";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { applyBookFormat, insertBookImage, type BookFormatOp } from "@/lib/bookEditorOps";
import { parseBook } from "@/lib/bookFormat";
import { splitChapterOpener } from "@/lib/bookReaderText";
import { READER_THEMES } from "@/lib/bookReaderTheme";
import { haptics } from "@/lib/haptics";
import { pickSingleImage } from "@/lib/pickImage";
import { useTheme } from "@/theme/ThemeProvider";
import { BookRichText } from "./BookRichText";

type Sel = { start: number; end: number };

const TOOLS: { op: BookFormatOp; label: string; text?: string; icon?: typeof Bold }[] = [
  { op: "h1", label: "Chapter title", text: "H1" },
  { op: "h2", label: "Heading", text: "H2" },
  { op: "h3", label: "Subheading", text: "H3" },
  { op: "bold", label: "Bold", icon: Bold },
  { op: "italic", label: "Italic", icon: Italic },
  { op: "code", label: "Inline code", icon: Code },
  { op: "link", label: "Link", icon: LinkIcon },
  { op: "bullet", label: "Bulleted list", icon: List },
  { op: "numbered", label: "Numbered list", icon: ListOrdered },
  { op: "quote", label: "Quote", icon: Quote },
  { op: "codeblock", label: "Code block (readers get a Copy button)", icon: FileCode },
  { op: "table", label: "Table", icon: TableIcon },
  { op: "divider", label: "Divider", icon: Minus },
];

export function BookChapterEditor({
  kind,
  title,
  content,
  onChange,
}: {
  kind: BookChapterKind;
  title: string;
  content: string;
  onChange: (content: string) => void;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [themeId] = useBookReaderTheme();
  const theme = READER_THEMES[themeId];
  const sel = useRef<Sel>({ start: content.length, end: content.length });
  // Set only right after a toolbar edit, to place the cursor; cleared by the next selection event so typing stays free.
  const [forced, setForced] = useState<Sel | null>(null);

  function apply(op: BookFormatOp) {
    haptics.selection();
    const r = applyBookFormat(content, sel.current.start, sel.current.end, op);
    sel.current = { start: r.start, end: r.end };
    onChange(r.text);
    setForced({ start: r.start, end: r.end });
  }

  const upload = useUploadProjectThumbnail();
  const [imageError, setImageError] = useState<string | null>(null);

  async function addImage() {
    haptics.selection();
    setImageError(null);
    // The picker takes focus away; remember where the cursor was.
    const at = { ...sel.current };
    try {
      const file = await pickSingleImage();
      if (!file) return;
      const { url } = await upload.mutateAsync(file);
      const r = insertBookImage(content, at.start, at.end, url);
      sel.current = { start: r.start, end: r.end };
      onChange(r.text);
      setForced({ start: r.start, end: r.end });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Couldn't upload that image.");
    }
  }

  function onSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    sel.current = e.nativeEvent.selection;
    if (forced) setForced(null);
  }

  const tab = (m: "write" | "preview", label: string) => (
    <Pressable
      onPress={() => setMode(m)}
      accessibilityRole="button"
      accessibilityState={{ selected: mode === m }}
      className={`rounded-full px-3 py-1 ${mode === m ? "bg-ink" : ""}`}
    >
      <Text className={`text-xs font-medium ${mode === m ? "text-canvas" : "text-ink-muted"}`}>{label}</Text>
    </Pressable>
  );

  const opener = mode === "preview" ? splitChapterOpener(parseBook(content), title, kind === "chapter" ? null : BOOK_SECTION_INFO[kind].label) : null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1">
        {tab("write", "Write")}
        {tab("preview", "Preview")}
      </View>

      {mode === "write" ? (
        <>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 2 }}>
            {TOOLS.map(({ op, label, text, icon }) => (
              <Pressable
                key={op}
                onPress={() => apply(op)}
                accessibilityRole="button"
                accessibilityLabel={label}
                hitSlop={4}
                className="h-9 min-w-9 items-center justify-center rounded-lg px-2 active:bg-surface"
              >
                {icon ? <Icon as={icon} size={16} className="text-ink-muted" /> : <Text className="text-xs font-semibold text-ink-muted">{text}</Text>}
              </Pressable>
            ))}
            <Pressable
              onPress={addImage}
              disabled={upload.isPending}
              accessibilityRole="button"
              accessibilityLabel="Image"
              hitSlop={4}
              className="h-9 min-w-9 items-center justify-center rounded-lg px-2 active:bg-surface"
              style={{ opacity: upload.isPending ? 0.4 : 1 }}
            >
              {upload.isPending ? <Text className="text-xs font-semibold text-ink-muted">…</Text> : <Icon as={ImageIcon} size={16} className="text-ink-muted" />}
            </Pressable>
          </ScrollView>
          {imageError ? <Text className="text-xs text-danger">{imageError}</Text> : null}
          <TextInput
            value={content}
            onChangeText={onChange}
            onSelectionChange={onSelectionChange}
            selection={forced ?? undefined}
            placeholder={BOOK_SECTION_INFO[kind].hint}
            placeholderTextColor={colors.inkMuted}
            multiline
            textAlignVertical="top"
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular", minHeight: 240 }}
            accessibilityLabel="Chapter text"
          />
        </>
      ) : (
        <View className="rounded-lg border border-border p-4" style={{ backgroundColor: theme.bg }}>
          {opener ? (
            <>
              {opener.eyebrow ? (
                <Text className="mb-2 text-center text-[11px] font-semibold uppercase" style={{ color: theme.muted, letterSpacing: 2 }}>
                  {opener.eyebrow}
                </Text>
              ) : null}
              <Text className="mb-4 text-center font-display text-2xl" style={{ color: theme.ink }}>
                {opener.title}
              </Text>
              {opener.body.length > 0 ? (
                <BookRichText blocks={opener.body} ink={theme.ink} muted={theme.muted} accent={theme.accent} fontSize={16} family="body" ornament />
              ) : (
                <Text style={{ color: theme.muted }}>Nothing here yet.</Text>
              )}
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}
