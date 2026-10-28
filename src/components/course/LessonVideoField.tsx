// src/components/course/LessonVideoField.tsx
// The video part of a lesson form: upload a file (up to 1 GB), replace or remove it, or paste a link instead.
// A file uploaded here but not yet saved with the lesson is "pending": it's deleted again if the creator cancels or
// replaces it, so abandoned uploads don't pile up in storage.
import * as ImagePicker from "expo-image-picker";
import { Film, Link2, RefreshCw, Trash2, Upload, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { formatDuration, isPortraitVideo, videoLinkProblem } from "@/lib/courseTypes";
import {
  removeCourseVideos,
  uploadCourseVideo,
  UPLOAD_CANCELLED,
  validateCourseVideo,
  videoMetaFromAsset,
  type CourseUploadHandle,
} from "@/lib/courseVideo";
import { friendlyError } from "@/lib/friendlyError";
import { fromImagePickerAsset } from "@/lib/localFile";
import { useTheme } from "@/theme/ThemeProvider";

export interface VideoValue {
  videoPath: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: number | null;
  mediaUrl: string;
}

export const EMPTY_VIDEO: VideoValue = { videoPath: null, videoWidth: null, videoHeight: null, videoDuration: null, mediaUrl: "" };

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "";
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function LessonVideoField({
  projectId,
  value,
  savedPath,
  onChange,
  onBusyChange,
}: {
  projectId: string;
  value: VideoValue;
  /** The path the lesson currently has in the database (null for a new lesson). Never deleted from here. */
  savedPath: string | null;
  onChange: (next: VideoValue) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const handleRef = useRef<CourseUploadHandle | null>(null);
  const [mode, setMode] = useState<"upload" | "link">(value.mediaUrl && !value.videoPath ? "link" : "upload");
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploading = progress !== null;
  const hasFile = !!value.videoPath;
  const portrait = isPortraitVideo(value.videoWidth, value.videoHeight);

  // Leaving the form mid-upload stops it.
  useEffect(
    () => () => {
      handleRef.current?.abort();
    },
    [],
  );

  // An upload that never got saved with the lesson is deleted when it's replaced or removed.
  const dropIfPending = (path: string | null) => {
    if (path && path !== savedPath) void removeCourseVideos([path]);
  };

  async function pick() {
    if (!user || uploading) return;
    setError(null);
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1, allowsMultipleSelection: false });
    } catch (err) {
      setError(friendlyError(err, "Couldn't open your videos."));
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const file = fromImagePickerAsset(asset);
    const problem = validateCourseVideo(file);
    if (problem) {
      setError(problem);
      return;
    }
    const meta = videoMetaFromAsset(asset);
    setFileName(file.name);
    setFileSize(file.size);
    setProgress(0);
    setStalled(false);
    onBusyChange(true);
    const { path, handle } = uploadCourseVideo({
      file,
      userId: user.id,
      projectId,
      onProgress: (pct) => {
        setProgress(pct);
        setStalled(false);
      },
      onStall: () => setStalled(true),
    });
    handleRef.current = handle;
    try {
      await handle.promise;
      dropIfPending(value.videoPath);
      onChange({
        videoPath: path,
        videoWidth: meta?.width ?? null,
        videoHeight: meta?.height ?? null,
        videoDuration: meta?.duration ?? null,
        mediaUrl: "",
      });
    } catch (err) {
      if (!(err instanceof Error) || err.message !== UPLOAD_CANCELLED) setError(friendlyError(err, "The upload didn't finish."));
      void removeCourseVideos([path]);
    } finally {
      handleRef.current = null;
      setProgress(null);
      onBusyChange(false);
    }
  }

  const linkProblem = videoLinkProblem(value.mediaUrl);

  return (
    <View className="gap-2">
      {!hasFile && !uploading && (
        <View className="flex-row gap-1 self-start rounded-full bg-surface p-0.5">
          {(["upload", "link"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
              className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${mode === m ? "bg-cta" : ""}`}
            >
              <Icon as={m === "upload" ? Upload : Link2} size={12} className={mode === m ? "text-white" : "text-ink-muted"} />
              <Text className={`text-xs font-medium ${mode === m ? "text-white" : "text-ink-muted"}`}>{m === "upload" ? "Upload" : "Link"}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {uploading && (
        <View className="rounded-xl border border-border bg-canvas p-3">
          <View className="mb-1.5 flex-row items-center gap-2">
            <Icon as={Film} size={15} className="text-ink-muted" />
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
              {fileName}
            </Text>
            {fmtSize(fileSize) ? <Text className="text-xs text-ink-muted">{fmtSize(fileSize)}</Text> : null}
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-border">
            <View className="h-full rounded-full bg-accent" style={{ width: `${progress ?? 0}%` }} />
          </View>
          <View className="mt-1.5 flex-row items-center justify-between">
            <Text className="text-xs text-ink-muted">{stalled ? "Reconnecting…" : `Uploading ${progress}%`}</Text>
            <Pressable onPress={() => handleRef.current?.abort()} accessibilityRole="button" accessibilityLabel="Cancel upload" hitSlop={8} className="flex-row items-center gap-1">
              <Icon as={X} size={12} className="text-danger" />
              <Text className="text-xs font-medium text-danger">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {hasFile && !uploading && (
        <View className="rounded-xl border border-border bg-canvas p-2.5">
          <View className="flex-row items-center gap-3">
            <View className={`items-center justify-center rounded-lg bg-surface ${portrait ? "h-16 w-9" : "h-14 w-24"}`}>
              <Icon as={Film} size={18} className="text-ink-muted" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-ink">Video uploaded</Text>
              <Text className="text-xs text-ink-muted">
                {[
                  value.videoDuration ? formatDuration(value.videoDuration) : null,
                  value.videoWidth && value.videoHeight ? (portrait ? "9:16" : "16:9") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Ready"}
              </Text>
            </View>
          </View>
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={() => void pick()} accessibilityRole="button" className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-border py-2">
              <Icon as={RefreshCw} size={14} className="text-ink" />
              <Text className="text-sm font-medium text-ink">Replace</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                dropIfPending(value.videoPath);
                onChange({ ...EMPTY_VIDEO });
              }}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2"
            >
              <Icon as={Trash2} size={14} className="text-danger" />
              <Text className="text-sm font-medium text-danger">Remove</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!hasFile && !uploading && mode === "upload" && (
        <Pressable onPress={() => void pick()} accessibilityRole="button" className="items-center gap-1 rounded-xl border border-dashed border-border bg-canvas px-4 py-6">
          <Icon as={Upload} size={20} className="text-accent" />
          <Text className="text-sm font-medium text-ink">Choose a video</Text>
          <Text className="text-center text-xs text-ink-muted">MP4, MOV or WebM, up to 1 GB. Portrait (9:16) videos fill the screen.</Text>
        </Pressable>
      )}

      {!hasFile && !uploading && mode === "link" && (
        <TextInput
          placeholder="YouTube, Vimeo, or a direct video URL"
          placeholderTextColor={colors.inkMuted}
          value={value.mediaUrl}
          onChangeText={(mediaUrl) => onChange({ ...value, mediaUrl })}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
          accessibilityLabel="Video link"
        />
      )}

      {!hasFile && !uploading && mode === "link" && linkProblem ? <Text className="text-xs text-danger">{linkProblem}</Text> : null}
      {error ? <Text className="text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
