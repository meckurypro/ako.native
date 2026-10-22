// src/components/project/ProjectFilesList.tsx
//
// The files of a multi-file File project on its own screen, like a tracklist: name and size for everyone, a Download
// button per file for people with access (the owner, a buyer, or anyone on a free project), a lock for the rest.
// Price and privacy belong to the project, so access is the same for every file in the list.
import { Download, File as FileIcon, Lock } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ProjectFile } from "@/hooks/useProjectFiles";
import { formatFileSize } from "@/lib/fileProject";

interface ProjectFilesListProps {
  files: ProjectFile[];
  hasAccess: boolean;
  /** True while any file is downloading (only one at a time). */
  busy: boolean;
  /** The file currently downloading, if any, and its progress (0-100, or null while preparing). */
  activeFileId: string | null;
  progress: number | null;
  onDownload: (file: ProjectFile) => void;
  /** Stops the download in progress; the active row then reads "Cancel" instead of being disabled. */
  onCancel?: () => void;
}

export function ProjectFilesList({ files, hasAccess, busy, activeFileId, progress, onDownload, onCancel }: ProjectFilesListProps) {
  return (
    <View className="mt-3 overflow-hidden rounded-2xl border border-border-a60 bg-canvas">
      {files.map((file, index) => {
        const active = busy && activeFileId === file.id;
        // At 100% the file is on the device and counted; the save sheet is open, so there's nothing left to cancel.
        const saving = active && progress === 100;
        const cancellable = active && !saving && !!onCancel;
        const size = file.size_bytes ? formatFileSize(file.size_bytes) : "";
        return (
          <View
            key={file.id}
            className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-border-a60" : ""}`}
          >
            <Text className="w-6 text-center text-xs font-medium text-ink-muted">{index + 1}</Text>
            <Icon as={FileIcon} size={16} className="text-ink-muted" />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm text-ink">
                {file.download_name}
              </Text>
              {size ? <Text className="text-xs text-ink-muted">{size}</Text> : null}
            </View>
            {hasAccess ? (
              <Pressable
                onPress={() => (cancellable ? onCancel?.() : onDownload(file))}
                disabled={busy && !cancellable}
                accessibilityRole="button"
                accessibilityLabel={`Download ${file.download_name}`}
                hitSlop={8}
                className={`flex-row items-center gap-1.5 ${busy && !cancellable ? "opacity-50" : ""}`}
              >
                <Icon as={Download} size={15} className="text-accent" />
                <Text className="text-sm font-medium text-accent">
                  {saving
                    ? "Complete"
                    : active
                      ? `${progress != null ? `${progress}%` : "Preparing…"}${cancellable ? " · Cancel" : ""}`
                      : "Download"}
                </Text>
              </Pressable>
            ) : (
              <Icon as={Lock} size={15} className="text-ink-muted" />
            )}
          </View>
        );
      })}
    </View>
  );
}
