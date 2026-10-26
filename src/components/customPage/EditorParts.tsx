// src/components/customPage/EditorParts.tsx
// Small form building blocks for the Custom Page editor (native twin of the web EditorParts): labelled fields,
// section headings, selectable option rows, and the image / file pickers that upload into the custom-pages bucket.
import * as DocumentPicker from "expo-document-picker";
import { ArrowDown, ArrowUp, Check, ChevronDown, FileText, ImagePlus, Trash2, Upload } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { uploadCustomPageFile } from "@/hooks/useCustomPages";
import { fileProblem, publicFileUrl, storagePathFor, type CustomPageImage } from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";
import { fromDocumentPickerAsset, type LocalFile } from "@/lib/localFile";
import { pickImages, pickSingleImage } from "@/lib/pickImage";
import { useTheme } from "@/theme/ThemeProvider";

export function Field({ label, hint, count, max, children }: { label: string; hint?: string; count?: number; max?: number; children: ReactNode }) {
  return (
    <View className="mb-5">
      <View className="mb-1.5 flex-row items-baseline justify-between">
        <Text className="text-[13px] font-medium text-ink">{label}</Text>
        {max !== undefined && count !== undefined ? (
          <Text className={`text-[11px] ${count > max ? "text-danger" : "text-ink-muted"}`}>
            {count}/{max}
          </Text>
        ) : null}
      </View>
      {children}
      {hint ? <Text className="mt-1.5 text-xs text-ink-muted">{hint}</Text> : null}
    </View>
  );
}

export function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <View className="mb-8">
      <Text className="font-display text-lg font-semibold text-ink">{title}</Text>
      {intro ? <Text className="mb-4 mt-1 text-sm text-ink-muted">{intro}</Text> : <View className="mb-3" />}
      {children}
    </View>
  );
}

/** The editor's text box: a surface-coloured field that sits under a <Field> label. */
export function Input({ rows, style, ...rest }: TextInputProps & { rows?: number }) {
  const { colors } = useTheme();
  return (
    <TextInput
      multiline={!!rows || rest.multiline}
      textAlignVertical={rows || rest.multiline ? "top" : "center"}
      placeholderTextColor={`${colors.inkMuted}99`}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      className="rounded-xl border border-border bg-surface px-4 py-3 text-[15px] text-ink"
      style={[{ fontFamily: "Inter_400Regular" }, rows ? { minHeight: rows * 22 + 24 } : null, style]}
      {...rest}
    />
  );
}

/** A tappable option with a radio dot — used for style, template, share look and position. */
export interface ChoiceOption {
  id: string;
  label: string;
  blurb?: string;
}

/**
 * A dropdown for choosing one option out of many (styles, templates). The closed control shows the current choice with
 * its one-line description; tapping it opens a scrollable list of every option with its description underneath.
 */
export function ChoiceSelect({ label, value, options, onChange }: { label: string; value: string; options: ChoiceOption[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink">{current?.label}</Text>
          {current?.blurb ? <Text className="mt-0.5 text-xs text-ink-muted">{current.blurb}</Text> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon as={ChevronDown} size={18} className="text-ink-muted" />
        </View>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface" accessibilityRole="menu">
          <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled showsVerticalScrollIndicator>
            {options.map((o, i) => {
              const active = o.id === value;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  className={`flex-row items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""} ${active ? "bg-accent-soft" : ""}`}
                >
                  <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full ${active ? "bg-accent" : "border border-border"}`}>
                    {active ? <Icon as={Check} size={13} className="text-canvas" /> : null}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-semibold text-ink">{o.label}</Text>
                    {o.blurb ? <Text className="mt-0.5 text-xs text-ink-muted">{o.blurb}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function Choice({ active, title, blurb, onPress }: { active: boolean; title: string; blurb: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      className={`flex-row items-start gap-3 rounded-2xl border p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full ${active ? "bg-accent" : "border border-border"}`}>
        {active ? <Icon as={Check} size={13} className="text-canvas" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        <Text className="mt-0.5 text-xs text-ink-muted">{blurb}</Text>
      </View>
    </Pressable>
  );
}

/** Uploads one local file to the page's folder and hands back its storage path (null if it was refused or failed). */
export function useFileUpload(ownerId: string, pageId: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // A second pick while one is uploading would race the busy flag; refuse it instead.
  const running = useRef(false);
  async function upload(file: LocalFile, kind: "image" | "file"): Promise<string | null> {
    if (running.current) return null;
    const problem = fileProblem(file, kind);
    if (problem) {
      toast(problem, { variant: "error", duration: 3500 });
      return null;
    }
    running.current = true;
    setBusy(true);
    try {
      const path = storagePathFor(ownerId, pageId, file);
      await uploadCustomPageFile(path, file);
      return path;
    } catch (err) {
      toast(friendlyError(err, "Upload failed. Please try again."), { variant: "error", duration: 3500 });
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { upload, busy };
}

const PILL = "flex-row items-center gap-1.5 self-start rounded-full bg-accent-soft px-4 py-2";

export function SingleImage({
  label,
  hint,
  path,
  ownerId,
  pageId,
  onChange,
  square,
}: {
  label: string;
  hint?: string;
  path?: string;
  ownerId: string;
  pageId: string;
  onChange: (path: string | undefined) => void;
  square?: boolean;
}) {
  const { upload, busy } = useFileUpload(ownerId, pageId);
  const url = publicFileUrl(path);
  async function pick() {
    const file = await pickSingleImage();
    if (!file) return;
    const p = await upload(file, "image");
    if (p) onChange(p);
  }
  return (
    <Field label={label} hint={hint}>
      <View className="flex-row items-center gap-3">
        <View className={`${square ? "h-16 w-16" : "h-16 w-24"} items-center justify-center overflow-hidden rounded-xl bg-accent-soft`}>
          {url ? <Image source={{ uri: url }} contentFit="cover" durable={false} fallback="none" style={{ width: "100%", height: "100%" }} /> : <Icon as={ImagePlus} size={20} className="text-accent" />}
        </View>
        <Pressable onPress={() => void pick()} disabled={busy} accessibilityRole="button" accessibilityLabel={url ? `Replace ${label}` : `Upload ${label}`} className={`${PILL} ${busy ? "opacity-50" : ""}`}>
          <Text className="text-sm font-medium text-accent">{busy ? "Uploading…" : url ? "Replace" : "Upload"}</Text>
        </Pressable>
        {url ? (
          <Pressable onPress={() => onChange(undefined)} accessibilityRole="button" hitSlop={8} className="px-2 py-2">
            <Text className="text-sm text-ink-muted">Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </Field>
  );
}

export function ImageList({
  label,
  hint,
  items,
  max,
  captions,
  ownerId,
  pageId,
  onChange,
}: {
  label: string;
  hint?: string;
  items: CustomPageImage[];
  max: number;
  captions?: boolean;
  ownerId: string;
  pageId: string;
  onChange: (items: CustomPageImage[]) => void;
}) {
  const { upload, busy } = useFileUpload(ownerId, pageId);
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  async function add() {
    const files = await pickImages({ limit: max - items.length });
    const added: CustomPageImage[] = [];
    for (const f of files) {
      const p = await upload(f, "image");
      if (p) added.push({ path: p });
    }
    if (added.length) onChange([...items, ...added]);
  }
  return (
    <Field label={label} hint={hint} count={items.length} max={max}>
      <View className="gap-2.5">
        {items.map((it, i) => (
          <View key={it.path} className="flex-row items-center gap-3 rounded-xl border border-border bg-surface p-2">
            <Image source={{ uri: publicFileUrl(it.path) ?? "" }} contentFit="cover" durable={false} fallback="none" style={{ width: 56, height: 56, borderRadius: 8 }} />
            {captions ? (
              <CaptionInput value={it.caption ?? ""} onChange={(v) => onChange(items.map((x, k) => (k === i ? { ...x, caption: v || undefined } : x)))} />
            ) : (
              <Text className="flex-1 text-sm text-ink-muted">Slide {i + 1}</Text>
            )}
            <View className="flex-row items-center">
              <Pressable onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel="Move up" hitSlop={6} className={`p-1.5 ${i === 0 ? "opacity-30" : ""}`}>
                <Icon as={ArrowUp} size={16} className="text-ink-muted" />
              </Pressable>
              <Pressable onPress={() => move(i, 1)} disabled={i === items.length - 1} accessibilityRole="button" accessibilityLabel="Move down" hitSlop={6} className={`p-1.5 ${i === items.length - 1 ? "opacity-30" : ""}`}>
                <Icon as={ArrowDown} size={16} className="text-ink-muted" />
              </Pressable>
              <Pressable onPress={() => onChange(items.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel="Remove image" hitSlop={6} className="p-1.5">
                <Icon as={Trash2} size={16} className="text-danger" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      {items.length < max ? (
        <Pressable onPress={() => void add()} disabled={busy} accessibilityRole="button" className={`mt-2.5 ${PILL} ${busy ? "opacity-50" : ""}`}>
          <Icon as={ImagePlus} size={16} className="text-accent" />
          <Text className="text-sm font-medium text-accent">{busy ? "Uploading…" : "Add images"}</Text>
        </Pressable>
      ) : null}
    </Field>
  );
}

function CaptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Caption (optional)"
      maxLength={160}
      accessibilityLabel="Caption"
      className="min-w-0 flex-1 py-1 text-sm text-ink"
      style={{ fontFamily: "Inter_400Regular" }}
    />
  );
}

export function FilePicker({
  label,
  hint,
  path,
  fileName,
  ownerId,
  pageId,
  pdfOnly,
  onChange,
}: {
  label: string;
  hint?: string;
  path?: string;
  fileName?: string;
  ownerId: string;
  pageId: string;
  pdfOnly?: boolean;
  onChange: (v: { path: string; name: string } | null) => void;
}) {
  const { upload, busy } = useFileUpload(ownerId, pageId);
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: pdfOnly ? "application/pdf" : "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const file = fromDocumentPickerAsset(result.assets[0]);
    const p = await upload(file, "file");
    if (p) onChange({ path: p, name: file.name });
  }
  return (
    <Field label={label} hint={hint}>
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <Icon as={FileText} size={20} className="text-accent" />
        <Text numberOfLines={1} className={`min-w-0 flex-1 text-sm ${path ? "text-ink" : "text-ink-muted"}`}>
          {path ? fileName || "Uploaded file" : "No file yet"}
        </Text>
        <Pressable onPress={() => void pick()} disabled={busy} accessibilityRole="button" accessibilityLabel={path ? `Replace ${label}` : `Upload ${label}`} className={`${PILL} ${busy ? "opacity-50" : ""}`}>
          <Icon as={Upload} size={14} className="text-accent" />
          <Text className="text-sm font-medium text-accent">{busy ? "Uploading…" : path ? "Replace" : "Upload"}</Text>
        </Pressable>
        {path ? (
          <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={6} className="p-1.5">
            <Icon as={Trash2} size={16} className="text-danger" />
          </Pressable>
        ) : null}
      </View>
    </Field>
  );
}
