// src/components/project-types/BookFields.tsx
import * as DocumentPicker from "expo-document-picker";
import { useEffect } from "react";
import { BookOpen, Download, FileUp, Link as LinkIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { InfoNote } from "@/components/ui/InfoNote";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import { fromDocumentPickerAsset } from "@/lib/localFile";
import { friendlyError } from "@/lib/friendlyError";

// What gets stored (project_book_details.content_source):
//   authored -> written in Akọ              (read on Akọ)
//   upload   -> PDF extracted into chapters (read on Akọ)
//   download -> hosted PDF, download only   (downloadable)
//   link     -> pointer to it elsewhere     (external link)
export type BookContentSource = "link" | "upload" | "authored" | "download";

// What the creator picks first: how readers get the book. It decides every
// option that follows, so "PDF to read here" and "PDF to download" can never
// be mistaken for each other.
export type BookDelivery = "read" | "download" | "link";

export function bookDeliveryOf(source: BookContentSource): BookDelivery {
  if (source === "download") return "download";
  if (source === "link") return "link";
  return "read";
}

export interface BookFieldsValue {
  book_type: "book" | "article";
  content_source: BookContentSource;
  url: string;
  file_path: string | null;
  file_name: string | null; // display-only
  allow_download: boolean;
  allow_read_in_app: boolean;
  is_own_work: boolean;
  author_name: string;
  source_credit: string;
}

export const EMPTY_BOOK_FIELDS: BookFieldsValue = {
  book_type: "book",
  content_source: "upload",
  url: "",
  file_path: null,
  file_name: null,
  allow_download: false,
  allow_read_in_app: true,
  is_own_work: true,
  author_name: "",
  source_credit: "",
};

const DELIVERY_OPTIONS: { value: BookDelivery; label: string; hint: string; icon: typeof BookOpen }[] = [
  { value: "read", label: "Read on Akọ", hint: "Readers read it here in the app.", icon: BookOpen },
  { value: "download", label: "Downloadable", hint: "Readers download your PDF file. No in-app reading.", icon: Download },
  { value: "link", label: "External link", hint: "Send readers to the book or article elsewhere.", icon: LinkIcon },
];

const READ_SOURCE_OPTIONS: { value: "authored" | "upload"; label: string; hint: string }[] = [
  { value: "authored", label: "Write it in Akọ", hint: "Build it chapter by chapter, right here, like a Course." },
  { value: "upload", label: "Upload a PDF", hint: "We pull the text out into chapters readers can read here." },
];

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row gap-2">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.value }}
          className={`flex-1 items-center rounded-xl border px-4 py-2.5 ${value === o.value ? "border-accent bg-accent-soft" : "border-border bg-canvas"}`}
        >
          <Text className={`text-sm font-medium ${value === o.value ? "text-ink" : "text-ink-muted"}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RadioCard({
  selected,
  onPress,
  label,
  hint,
  icon,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  hint: string;
  icon?: typeof BookOpen;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-start gap-3 rounded-xl border px-4 py-3 ${selected ? "border-accent bg-accent-soft" : "border-border bg-canvas"}`}
    >
      <View className={`mt-0.5 h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-accent" : "border-ink-muted-a50"}`}>
        {selected ? <View className="h-2 w-2 rounded-full bg-accent" /> : null}
      </View>
      {icon ? <Icon as={icon} size={16} className="mt-0.5 text-ink-muted" /> : null}
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink">{label}</Text>
        <Text className="text-xs text-ink-muted">{hint}</Text>
      </View>
    </Pressable>
  );
}

export function BookFields({
  value,
  onChange,
  onError,
  existingSource,
}: {
  value: BookFieldsValue;
  onChange: (value: BookFieldsValue) => void;
  onError: (message: string) => void;
  /** Edit screen: the book's saved source. Stays selectable even if its flag is now off. */
  existingSource?: BookContentSource;
}) {
  const uploadFile = useUploadProjectFile();
  const pdfUploadEnabled = useFeatureFlag("book_pdf_upload_enabled");
  const downloadEnabled = useFeatureFlag("book_download_enabled");
  const linkEnabled = useFeatureFlag("book_link_enabled");

  // Admin feature flags can hide an option. A book that already uses a hidden
  // source keeps showing it (existingSource) so editing it doesn't strand it;
  // everything else just loses the option.
  const sourceAllowed = (s: BookContentSource): boolean => {
    if (s === existingSource) return true;
    if (s === "upload") return pdfUploadEnabled;
    if (s === "download") return downloadEnabled;
    if (s === "link") return linkEnabled;
    return true; // authored is never gated
  };

  const deliveryAllowed = (d: BookDelivery): boolean => {
    if (d === "read") return true; // "Write it in Akọ" is always available
    if (d === "download") return sourceAllowed("download");
    return sourceAllowed("link");
  };

  const visibleDeliveries = DELIVERY_OPTIONS.filter((o) => deliveryAllowed(o.value));
  const visibleReadSources = READ_SOURCE_OPTIONS.filter((o) => sourceAllowed(o.value));
  const delivery = bookDeliveryOf(value.content_source);

  // Switching branches doesn't clear the other branches' state (url, file).
  // It does reset the access flags so a PDF meant for download can't carry
  // "read in app" over, and vice versa.
  function setSource(next: BookContentSource) {
    if (next === value.content_source) return;
    if (next === "download") onChange({ ...value, content_source: next, allow_download: true, allow_read_in_app: false });
    else if (next === "upload") onChange({ ...value, content_source: next, allow_download: false, allow_read_in_app: true });
    else onChange({ ...value, content_source: next });
  }

  function setDelivery(next: BookDelivery) {
    if (next === delivery) return;
    if (next === "read") setSource("authored");
    else setSource(next);
  }

  // If the current selection isn't offered (e.g. the default "upload" while
  // that flag is off), fall back to one that is.
  useEffect(() => {
    if (!sourceAllowed(value.content_source)) setSource("authored");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUploadEnabled, downloadEnabled, linkEnabled, existingSource, value.content_source]);

  async function handleChoosePdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = fromDocumentPickerAsset(result.assets[0]);
      if (file.type !== "application/pdf") return onError("Only PDF files are supported for upload right now.");
      const path = await uploadFile.mutateAsync(file);
      onChange({ ...value, file_path: path, file_name: file.name });
    } catch (err) {
      onError(friendlyError(err, "File upload failed."));
    }
  }

  const pdfPicker = (label: string) => (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">{label}</Text>
      <Pressable
        onPress={() => void handleChoosePdf()}
        disabled={uploadFile.isPending}
        accessibilityRole="button"
        className={`w-full flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 ${uploadFile.isPending ? "opacity-50" : ""}`}
      >
        <Icon as={FileUp} size={16} className="text-ink-muted" />
        <Text numberOfLines={1} className="flex-1 text-sm text-ink-muted">
          {uploadFile.isPending ? "Uploading…" : value.file_name ? value.file_name : value.file_path ? "File uploaded — tap to replace" : "Choose PDF"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View>
      {/* Book vs Article — mostly cosmetic (a badge on the card). */}
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">Type</Text>
        <Segmented
          options={[
            { value: "book", label: "Book" },
            { value: "article", label: "Article" },
          ]}
          value={value.book_type}
          onChange={(book_type) => onChange({ ...value, book_type })}
        />
      </View>

      {/* Step 1 — how readers get it. */}
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">How will readers get it?</Text>
        <View className="gap-2">
          {visibleDeliveries.map((opt) => (
            <RadioCard key={opt.value} selected={delivery === opt.value} onPress={() => setDelivery(opt.value)} label={opt.label} hint={opt.hint} icon={opt.icon} />
          ))}
        </View>
      </View>

      {/* Step 2 — depends on step 1. */}
      {delivery === "read" && visibleReadSources.length > 1 ? (
        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-ink-muted">How do you want to add it?</Text>
          <View className="gap-2">
            {visibleReadSources.map((opt) => (
              <RadioCard key={opt.value} selected={value.content_source === opt.value} onPress={() => setSource(opt.value)} label={opt.label} hint={opt.hint} />
            ))}
          </View>
        </View>
      ) : null}

      {value.content_source === "authored" ? (
        <InfoNote>This creates a draft. Build your chapters next, add a cover, then publish when it's ready — no one can buy it until you do.</InfoNote>
      ) : null}

      {value.content_source === "upload" ? (
        <>
          {pdfPicker("PDF to read on Akọ")}
          <Text className="-mt-2 mb-4 text-xs text-ink-muted">Readers read it here in Akọ. They won't get the PDF file itself — choose Downloadable for that.</Text>
          {/* Older books could also allow download alongside reading. New ones don't offer it; this only shows when the saved book still has it on. */}
          {value.allow_download ? (
            <View className="mb-4">
              <Checkbox checked={value.allow_download} onChange={(allow_download) => onChange({ ...value, allow_download })} label="Readers can also download the PDF (older setting — untick to turn it off)" />
            </View>
          ) : null}
        </>
      ) : null}

      {value.content_source === "download" ? (
        <>
          {pdfPicker("PDF for download")}
          <Text className="-mt-2 mb-4 text-xs text-ink-muted">Readers download this file as it is. It isn't readable inside Akọ.</Text>
        </>
      ) : null}

      {value.content_source === "link" ? (
        <FormField label="Link" value={value.url} onChangeText={(url) => onChange({ ...value, url })} placeholder="https://..." keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      ) : null}

      {/* Attribution — independent of content_source. Publishing someone else's work with credit forces the price to $0. */}
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">Author</Text>
        <View className="mb-2">
          <Segmented
            options={[
              { value: "own", label: "I wrote this" },
              { value: "other", label: "Someone else wrote this" },
            ]}
            value={value.is_own_work ? "own" : "other"}
            onChange={(v) => onChange({ ...value, is_own_work: v === "own" })}
          />
        </View>

        {!value.is_own_work ? (
          <>
            <FormField label="Author's name" value={value.author_name} onChangeText={(author_name) => onChange({ ...value, author_name })} placeholder="Who actually wrote it" />
            <FormField
              label="Credit / source (optional)"
              value={value.source_credit}
              onChangeText={(source_credit) => onChange({ ...value, source_credit })}
              placeholder="e.g. Originally published by Acme Press, shared with permission"
            />
            <Text className="-mt-3 mb-4 text-xs text-ink-muted">You're crediting someone else as the author, so this can't be sold — price is locked at $0.</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}
