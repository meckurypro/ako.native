// src/components/project-types/FileFields.tsx
//
// A File project holds one or more files, laid out like tracks on an album upload: each file is a "slot" — upload
// the file, and (optionally) type the name you want the downloaded copy to bear. Leave the name blank and the
// download is named after the uploaded file. Price and privacy are the project's, not the file's, so they aren't
// here. How many slots: 1, or up to 6 for verified accounts (the database enforces it; `maxFiles` decides what to
// show).
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFs from "expo-file-system/legacy";
import { Check, FileUp, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ProjectFile, ProjectFileInput } from "@/hooks/useProjectFiles";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import {
  MAX_PROJECT_FILES_VERIFIED,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_FILE_LABEL,
  formatFileSize,
  stripExtension,
} from "@/lib/fileProject";
import { fromDocumentPickerAsset } from "@/lib/localFile";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";

export interface FileSlot {
  /** Local React key only — never sent anywhere. */
  key: string;
  /** project_files.id once the file is saved on the project; null for a file uploaded in this session. */
  id: string | null;
  /** private-content path; null while the slot is still empty. */
  file_path: string | null;
  /** The uploaded file's own name, with extension. */
  original_name: string | null;
  /** The title typed for the downloaded copy. "" = use the uploaded file's name. */
  display_name: string;
  size_bytes: number | null;
}

export interface FileFieldsValue {
  files: FileSlot[];
}

// No slots in state = one empty slot is shown but nothing has been entered. (So an untouched form compares equal to
// this and never counts as unsaved progress.)
export const EMPTY_FILE_FIELDS: FileFieldsValue = { files: [] };

function newKey(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newFileSlot(): FileSlot {
  return { key: newKey(), id: null, file_path: null, original_name: null, display_name: "", size_bytes: null };
}

/** The Edit form's starting value: one slot per saved file, in order. */
export function fileFieldsFromProjectFiles(files: ProjectFile[]): FileFieldsValue {
  return {
    files: files.map((f) => ({
      key: f.id,
      id: f.id,
      file_path: f.file_path,
      original_name: f.original_name,
      // Only a title somebody typed is shown as one; the rest fall back to the placeholder.
      display_name: f.display_name ?? "",
      size_bytes: f.size_bytes,
    })),
  };
}

/**
 * Makes any stored value safe to use. A "New project" draft saved before multi-file support held a single
 * { file_path, file_name }; it comes back as one filled slot instead of crashing the form.
 */
export function normalizeFileFields(raw: unknown): FileFieldsValue {
  const v = raw as { files?: unknown; file_path?: unknown; file_name?: unknown } | null | undefined;
  if (v && Array.isArray(v.files)) {
    return {
      files: (v.files as Partial<FileSlot>[]).map((s) => ({
        key: s.key || newKey(),
        id: s.id ?? null,
        file_path: s.file_path ?? null,
        original_name: s.original_name ?? null,
        display_name: s.display_name ?? "",
        size_bytes: s.size_bytes ?? null,
      })),
    };
  }
  if (v && typeof v.file_path === "string" && v.file_path) {
    const path = v.file_path;
    return {
      files: [
        {
          key: newKey(),
          id: null,
          file_path: path,
          original_name: typeof v.file_name === "string" && v.file_name ? v.file_name : (path.split("/").pop() ?? "file"),
          display_name: "",
          size_bytes: null,
        },
      ],
    };
  }
  return EMPTY_FILE_FIELDS;
}

/** Has anything actually been uploaded? (Empty slots and typed titles alone aren't progress.) */
export function fileFieldsHaveProgress(v: FileFieldsValue): boolean {
  return v.files.some((s) => !!s.file_path);
}

/** null when the files are ready to save; otherwise what to tell the person. */
export function fileFieldsError(v: FileFieldsValue): string | null {
  if (v.files.length === 0) return "Upload a file to continue.";
  if (v.files.some((s) => !s.file_path)) return "Upload a file for every slot, or remove the empty one.";
  return null;
}

/** The ordered list set_project_files expects. */
export function fileFieldsToInputs(v: FileFieldsValue): ProjectFileInput[] {
  return v.files
    .filter((s) => !!s.file_path)
    .map((s) => ({
      id: s.id,
      file_path: s.file_path as string,
      original_name: s.original_name || (s.file_path as string).split("/").pop() || "file",
      display_name: s.display_name.trim() || null,
      size_bytes: s.size_bytes,
    }));
}

interface FileFieldsProps {
  value: FileFieldsValue;
  onChange: (value: FileFieldsValue) => void;
  onError: (message: string) => void;
  /** 1 for most accounts, up to 6 for verified ones (see maxProjectFiles). */
  maxFiles: number;
  /** Lets the form hold its submit button while any (possibly very large) upload is still going. */
  onUploadingChange?: (uploading: boolean) => void;
}

// File projects only ever store uploaded files — no redirect/marketing link — so there is no link-or-upload toggle.
export function FileFields({ value, onChange, onError, maxFiles, onUploadingChange }: FileFieldsProps) {
  const slots = value.files.length > 0 ? value.files : [{ ...newFileSlot(), key: "first" }];
  const canAddMore = maxFiles > 1 && slots.length < maxFiles;

  // Each slot uploads on its own; the form only needs to know whether ANY of them is still going.
  const [uploadingBySlot, setUploadingBySlot] = useState<Record<string, boolean>>({});
  const anyUploading = Object.values(uploadingBySlot).some(Boolean);
  const reportUploading = useCallback((key: string, uploading: boolean) => {
    setUploadingBySlot((prev) => (!!prev[key] === uploading ? prev : { ...prev, [key]: uploading }));
  }, []);
  useEffect(() => {
    onUploadingChange?.(anyUploading);
  }, [anyUploading, onUploadingChange]);
  // Leaving the screen mid-upload must not leave the form's submit stuck on "busy".
  useEffect(() => () => onUploadingChange?.(false), [onUploadingChange]);

  function update(next: FileSlot[]) {
    onChange({ files: next });
  }

  function patchSlot(key: string, patch: Partial<FileSlot>) {
    update(slots.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeSlot(slot: FileSlot) {
    // An upload that was never saved on the project has nothing pointing at it — don't leave it in storage.
    if (slot.file_path && !slot.id) {
      void supabase.storage.from("private-content").remove([slot.file_path]);
    }
    update(slots.filter((s) => s.key !== slot.key));
  }

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">{maxFiles > 1 ? "Files" : "File"}</Text>

      {slots.map((slot, index) => (
        <FileSlotRow
          key={slot.key}
          index={index}
          slot={slot}
          showNumber={maxFiles > 1}
          canRemove={slots.length > 1}
          onPatch={(patch) => patchSlot(slot.key, patch)}
          onRemove={() => removeSlot(slot)}
          onError={onError}
          onUploadingChange={reportUploading}
        />
      ))}

      {canAddMore ? (
        <Pressable
          onPress={() => update([...slots, newFileSlot()])}
          accessibilityRole="button"
          className="w-full flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5"
        >
          <Icon as={Plus} size={16} className="text-accent" />
          <Text className="text-sm font-medium text-accent">Add another file</Text>
          <Text className="text-sm text-ink-muted">
            ({slots.length}/{maxFiles})
          </Text>
        </Pressable>
      ) : null}

      <Text className="mt-2 text-xs text-ink-muted">
        {anyUploading
          ? "Keep this screen open until the upload finishes."
          : `Up to ${MAX_PROJECT_FILE_LABEL}${maxFiles > 1 ? " per file" : ""}. Hosted here — no external link is stored. Visitors with access download it with one tap.${
              maxFiles > 1
                ? " Downloads are named after the uploaded file unless you type a name."
                : ` Verified accounts can add up to ${MAX_PROJECT_FILES_VERIFIED} files.`
            }`}
      </Text>
    </View>
  );
}

interface FileSlotRowProps {
  index: number;
  slot: FileSlot;
  showNumber: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<FileSlot>) => void;
  onRemove: () => void;
  onError: (message: string) => void;
  onUploadingChange: (key: string, uploading: boolean) => void;
}

// One slot owns its own uploader so each file shows its own progress.
function FileSlotRow({ index, slot, showNumber, canRemove, onPatch, onRemove, onError, onUploadingChange }: FileSlotRowProps) {
  const { colors } = useTheme();
  const uploadFile = useUploadProjectFile({ maxBytes: MAX_PROJECT_FILE_BYTES });
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const uploading = uploadFile.isPending;
  const slotKey = slot.key;

  useEffect(() => {
    onUploadingChange(slotKey, uploading);
  }, [slotKey, uploading, onUploadingChange]);
  // A slot that goes away mid-upload must not leave the form thinking something is still uploading.
  useEffect(() => () => onUploadingChange(slotKey, false), [slotKey, onUploadingChange]);

  async function handleChoose() {
    let cachedUri: string | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = fromDocumentPickerAsset(result.assets[0]);
      cachedUri = file.uri;
      setUploadingName(file.name);
      const path = await uploadFile.mutateAsync(file);
      // Replacing a file that was only uploaded in this session: the old object is now unreferenced.
      if (slot.file_path && !slot.id) void supabase.storage.from("private-content").remove([slot.file_path]);
      // id: null — a different file is a new file; the old saved row (if any) is dropped when the project saves.
      onPatch({ id: null, file_path: path, original_name: file.name, size_bytes: file.size > 0 ? file.size : null });
    } catch (err) {
      onError(err instanceof Error ? err.message : "File upload failed.");
    } finally {
      setUploadingName(null);
      // The picker copied the file into the app's cache so it could be read; a 1GB upload shouldn't leave a 1GB copy.
      if (cachedUri && LegacyFs.cacheDirectory && cachedUri.startsWith(LegacyFs.cacheDirectory)) {
        void LegacyFs.deleteAsync(cachedUri, { idempotent: true }).catch(() => undefined);
      }
    }
  }

  const hasFile = !!slot.file_path;
  const title = uploading ? (uploadingName ?? "Uploading…") : (slot.original_name ?? "Choose file");
  const subtitle = uploading
    ? `Uploading… ${uploadFile.progress}%`
    : hasFile
      ? `${slot.size_bytes ? `${formatFileSize(slot.size_bytes)} · ` : ""}Tap to replace`
      : `Up to ${MAX_PROJECT_FILE_LABEL}`;

  return (
    <View className="mb-3 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center gap-2">
        {showNumber ? (
          <View className="h-6 w-6 items-center justify-center rounded-full border border-border bg-canvas">
            <Text className="text-xs font-medium text-ink-muted">{index + 1}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => void handleChoose()}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={hasFile ? `Replace file ${index + 1}` : `Choose file ${index + 1}`}
          accessibilityState={{ busy: uploading, disabled: uploading }}
          className={`min-w-0 flex-1 overflow-hidden rounded-xl border bg-canvas ${hasFile && !uploading ? "border-accent-a40" : "border-border"}`}
        >
          <View className="flex-row items-center gap-3 px-3 py-2.5">
            <View className={`h-9 w-9 items-center justify-center rounded-lg ${hasFile && !uploading ? "bg-accent-soft" : "bg-surface"}`}>
              <Icon as={hasFile && !uploading ? Check : FileUp} size={16} className={hasFile && !uploading ? "text-accent" : "text-ink-muted"} />
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className={`text-sm font-medium ${hasFile || uploading ? "text-ink" : "text-ink-muted"}`}>
                {title}
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-xs text-ink-muted">
                {subtitle}
              </Text>
            </View>
          </View>
          {uploading ? (
            <View className="h-1 w-full bg-border">
              <View className="h-1 bg-accent" style={{ width: `${Math.min(100, Math.max(2, uploadFile.progress))}%` }} />
            </View>
          ) : null}
        </Pressable>
        {canRemove ? (
          <Pressable
            onPress={onRemove}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={`Remove file ${index + 1}`}
            hitSlop={8}
            className={`p-2 ${uploading ? "opacity-50" : ""}`}
          >
            <Icon as={Trash2} size={16} className="text-ink-muted" />
          </Pressable>
        ) : null}
      </View>

      {slot.file_path ? (
        <TextInput
          value={slot.display_name}
          onChangeText={(display_name) => onPatch({ display_name })}
          maxLength={100}
          placeholder={slot.original_name ? stripExtension(slot.original_name) : "Name of the downloaded file"}
          placeholderTextColor={`${colors.inkMuted}99`}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          accessibilityLabel={`Download name for file ${index + 1}`}
          className="mt-2 rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-ink"
        />
      ) : null}
    </View>
  );
}
