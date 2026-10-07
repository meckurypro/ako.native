// src/components/project-types/FileFields.tsx
import * as DocumentPicker from "expo-document-picker";
import { FileUp } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import { fromDocumentPickerAsset } from "@/lib/localFile";

export interface FileFieldsValue {
  file_path: string | null;
  file_name: string | null; // display-only, not sent to the server
}

export const EMPTY_FILE_FIELDS: FileFieldsValue = { file_path: null, file_name: null };

interface FileFieldsProps {
  value: FileFieldsValue;
  onChange: (value: FileFieldsValue) => void;
  onError: (message: string) => void;
}

export function FileFields({ value, onChange, onError }: FileFieldsProps) {
  const uploadFile = useUploadProjectFile();

  async function handleChoose() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = fromDocumentPickerAsset(result.assets[0]);
      const path = await uploadFile.mutateAsync(file);
      onChange({ file_path: path, file_name: file.name });
    } catch (err) {
      onError(err instanceof Error ? err.message : "File upload failed.");
    }
  }

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">File</Text>
      <Pressable
        onPress={() => void handleChoose()}
        disabled={uploadFile.isPending}
        accessibilityRole="button"
        className={`w-full flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 ${uploadFile.isPending ? "opacity-50" : ""}`}
      >
        <Icon as={FileUp} size={16} className="text-ink-muted" />
        <Text numberOfLines={1} className="flex-1 text-sm text-ink-muted">
          {uploadFile.isPending
            ? "Uploading…"
            : value.file_name
              ? value.file_name
              : value.file_path // editing an existing File project: path is already set
                ? "File uploaded — tap to replace"
                : "Choose file"}
        </Text>
      </Pressable>
      <Text className="mt-1 text-xs text-ink-muted">Hosted here — no external link is stored. Visitors with access download it with one tap.</Text>
    </View>
  );
}
