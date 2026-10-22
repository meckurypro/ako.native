// src/components/project-types/FileFields.tsx
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFs from "expo-file-system/legacy";
import { Check, FileUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import { formatFileSize, MAX_PROJECT_FILE_BYTES, MAX_PROJECT_FILE_LABEL } from "@/lib/fileProject";
import { fromDocumentPickerAsset } from "@/lib/localFile";

export interface FileFieldsValue {
  file_path: string | null;
  file_name: string | null; // display-only, not sent to the server
  file_size?: number | null; // display-only, set when this session picked the file
}

export const EMPTY_FILE_FIELDS: FileFieldsValue = { file_path: null, file_name: null };

interface FileFieldsProps {
  value: FileFieldsValue;
  onChange: (value: FileFieldsValue) => void;
  onError: (message: string) => void;
  /** Lets the form hold its submit button while a (possibly very large) upload is still going. */
  onUploadingChange?: (uploading: boolean) => void;
}

// File projects only ever store the uploaded file itself — no redirect/marketing link, so there is no
// link-or-upload toggle: this is upload-only, always.
export function FileFields({ value, onChange, onError, onUploadingChange }: FileFieldsProps) {
  const uploadFile = useUploadProjectFile({ maxBytes: MAX_PROJECT_FILE_BYTES });
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const uploading = uploadFile.isPending;

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);
  // Leaving the screen mid-upload must not leave the form's submit stuck on "busy".
  useEffect(() => () => onUploadingChange?.(false), [onUploadingChange]);

  async function handleChoose() {
    let cachedUri: string | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = fromDocumentPickerAsset(result.assets[0]);
      cachedUri = file.uri;
      setUploadingName(file.name);
      const path = await uploadFile.mutateAsync(file);
      onChange({ file_path: path, file_name: file.name, file_size: file.size > 0 ? file.size : null });
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

  const hasFile = !!value.file_path;
  const title = uploading
    ? (uploadingName ?? "Uploading…")
    : value.file_name
      ? value.file_name
      : hasFile
        ? // Editing an existing File project: the path is set from the row, but the original filename was never
          // stored — say so rather than "Choose file", which would read as "nothing uploaded yet".
          "File uploaded"
        : "Choose file";
  const subtitle = uploading
    ? `Uploading… ${uploadFile.progress}%`
    : hasFile
      ? `${value.file_size ? `${formatFileSize(value.file_size)} · ` : ""}Tap to replace`
      : `Up to ${MAX_PROJECT_FILE_LABEL}`;

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">File</Text>
      <Pressable
        onPress={() => void handleChoose()}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={hasFile ? "Replace file" : "Choose file"}
        accessibilityState={{ busy: uploading, disabled: uploading }}
        className={`w-full overflow-hidden rounded-xl border bg-surface ${hasFile && !uploading ? "border-accent-a40" : "border-border"}`}
      >
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className={`h-9 w-9 items-center justify-center rounded-lg ${hasFile && !uploading ? "bg-accent-soft" : "bg-canvas"}`}>
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
      <Text className="mt-1 text-xs text-ink-muted">
        {uploading
          ? "Keep this screen open until the upload finishes."
          : `Up to ${MAX_PROJECT_FILE_LABEL}. Hosted here — no external link is stored. Visitors with access download it with one tap.`}
      </Text>
    </View>
  );
}
