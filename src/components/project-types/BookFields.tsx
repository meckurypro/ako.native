// src/components/project-types/BookFields.tsx
import * as DocumentPicker from "expo-document-picker";
import { FileUp } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { InfoNote } from "@/components/ui/InfoNote";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import { fromDocumentPickerAsset } from "@/lib/localFile";

export type BookContentSource = "link" | "upload" | "authored";

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

const SOURCE_OPTIONS: { value: BookContentSource; label: string; hint: string }[] = [
  { value: "upload", label: "Upload PDF", hint: "Host the file here — allow download, in-app reading, or both." },
  { value: "link", label: "Link", hint: "Redirect readers to it elsewhere — nothing hosted here." },
  { value: "authored", label: "Write in Akọ", hint: "Build it chapter by chapter, right here, like a Course." },
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

export function BookFields({ value, onChange, onError }: { value: BookFieldsValue; onChange: (value: BookFieldsValue) => void; onError: (message: string) => void }) {
  const uploadFile = useUploadProjectFile();

  async function handleChoosePdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = fromDocumentPickerAsset(result.assets[0]);
      if (file.type !== "application/pdf") return onError("Only PDF files are supported for upload right now.");
      const path = await uploadFile.mutateAsync(file);
      onChange({ ...value, file_path: path, file_name: file.name });
    } catch (err) {
      onError(err instanceof Error ? err.message : "File upload failed.");
    }
  }

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

      {/* Content source — switching doesn't clear the other modes' state. */}
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">How are you adding it?</Text>
        <View className="gap-2">
          {SOURCE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => onChange({ ...value, content_source: opt.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected: value.content_source === opt.value }}
              className={`flex-row items-start gap-3 rounded-xl border px-4 py-3 ${value.content_source === opt.value ? "border-accent bg-accent-soft" : "border-border bg-canvas"}`}
            >
              <View className={`mt-0.5 h-4 w-4 items-center justify-center rounded-full border ${value.content_source === opt.value ? "border-accent" : "border-ink-muted/50"}`}>
                {value.content_source === opt.value ? <View className="h-2 w-2 rounded-full bg-accent" /> : null}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-ink">{opt.label}</Text>
                <Text className="text-xs text-ink-muted">{opt.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {value.content_source === "link" ? (
        <FormField label="Link" value={value.url} onChangeText={(url) => onChange({ ...value, url })} placeholder="https://..." keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      ) : null}

      {value.content_source === "upload" ? (
        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-ink-muted">PDF</Text>
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

          <View className="mt-3 gap-2">
            <Checkbox checked={value.allow_read_in_app} onChange={(allow_read_in_app) => onChange({ ...value, allow_read_in_app })} label="Let readers read it right here in Akọ" />
            <Checkbox checked={value.allow_download} onChange={(allow_download) => onChange({ ...value, allow_download })} label="Let readers download the PDF" />
          </View>
        </View>
      ) : null}

      {value.content_source === "authored" ? (
        <InfoNote>This creates a draft. Build your chapters next, add a cover, then publish when it's ready — no one can buy it until you do.</InfoNote>
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
