// src/components/project-types/MediaFields.tsx
// Media project: pick any mix of Audio / Video / Image. Audio and video can be a
// link to the full thing and/or an uploaded ~30s preview; an image is uploaded.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { FileUp, Image as ImageIcon, Music, Video as VideoIcon, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectFile } from "@/hooks/useUploadProjectFile";
import { fromDocumentPickerAsset, fromImagePickerAsset, type LocalFile } from "@/lib/localFile";

export interface MediaChannelValue {
  enabled: boolean;
  url: string;
  file_path: string | null;
  file_name: string | null; // display-only, not sent to the server
}

const EMPTY_CHANNEL: MediaChannelValue = { enabled: false, url: "", file_path: null, file_name: null };

export interface MediaFieldsValue {
  audio: MediaChannelValue;
  video: MediaChannelValue;
  image: MediaChannelValue;
}

export const EMPTY_MEDIA_FIELDS: MediaFieldsValue = { audio: { ...EMPTY_CHANNEL }, video: { ...EMPTY_CHANNEL }, image: { ...EMPTY_CHANNEL } };

export function mediaFieldsAreValid(value: MediaFieldsValue): boolean {
  if (!value.audio.enabled && !value.video.enabled && !value.image.enabled) return false;
  const avChannelValid = (c: MediaChannelValue) => !c.enabled || c.url.trim() !== "" || !!c.file_path;
  const imageValid = !value.image.enabled || !!value.image.file_path;
  return avChannelValid(value.audio) && avChannelValid(value.video) && imageValid;
}

interface ChannelConfig {
  key: "audio" | "video" | "image";
  label: string;
  icon: LucideIcon;
  allowLink: boolean;
  linkLabel: string;
  linkPlaceholder: string;
  uploadLabel: string;
  uploadNote: string;
  pick: () => Promise<LocalFile | null>;
}

async function pickAudio(): Promise<LocalFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
  return r.canceled ? null : fromDocumentPickerAsset(r.assets[0]);
}
async function pickVideo(): Promise<LocalFile | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1 });
  return r.canceled ? null : fromImagePickerAsset(r.assets[0]);
}
async function pickImage(): Promise<LocalFile | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  return r.canceled ? null : fromImagePickerAsset(r.assets[0]);
}

const CHANNELS: ChannelConfig[] = [
  {
    key: "audio",
    label: "Audio",
    icon: Music,
    allowLink: true,
    linkLabel: "Link to the full track (Spotify, Apple Music, etc.)",
    linkPlaceholder: "https://open.spotify.com/...",
    uploadLabel: "Upload a preview clip",
    uploadNote: "Plays right here as a ~30-second preview — not the full track.",
    pick: pickAudio,
  },
  {
    key: "video",
    label: "Video",
    icon: VideoIcon,
    allowLink: true,
    linkLabel: "Link to the full video (YouTube, Vimeo, etc.)",
    linkPlaceholder: "https://youtube.com/...",
    uploadLabel: "Upload a preview clip",
    uploadNote: "Plays right here as a ~30-second preview — not the full video.",
    pick: pickVideo,
  },
  {
    key: "image",
    label: "Image",
    icon: ImageIcon,
    allowLink: false,
    linkLabel: "",
    linkPlaceholder: "",
    uploadLabel: "Upload the image",
    uploadNote: "Displayed in full here — visitors with access can download it or copy a link to it.",
    pick: pickImage,
  },
];

interface MediaFieldsProps {
  value: MediaFieldsValue;
  onChange: (value: MediaFieldsValue) => void;
  onError: (message: string) => void;
}

function MediaChannelFields({ config, value, onChange, onError }: { config: ChannelConfig; value: MediaChannelValue; onChange: (v: MediaChannelValue) => void; onError: (m: string) => void }) {
  const uploadFile = useUploadProjectFile();

  async function handleChoose() {
    try {
      const file = await config.pick();
      if (!file) return;
      const path = await uploadFile.mutateAsync(file);
      onChange({ ...value, file_path: path, file_name: file.name });
    } catch (err) {
      onError(err instanceof Error ? err.message : "File upload failed.");
    }
  }

  return (
    <View className="mb-3 border-l-2 border-border pl-3">
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">{config.uploadLabel}</Text>
        <Pressable
          onPress={() => void handleChoose()}
          disabled={uploadFile.isPending}
          accessibilityRole="button"
          className={`w-full flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 ${uploadFile.isPending ? "opacity-50" : ""}`}
        >
          <Icon as={FileUp} size={16} className="text-ink-muted" />
          <Text numberOfLines={1} className="flex-1 text-sm text-ink-muted">
            {uploadFile.isPending ? "Uploading…" : value.file_name ? value.file_name : value.file_path ? "File uploaded — tap to replace" : "Choose file"}
          </Text>
        </Pressable>
        {value.file_path && !uploadFile.isPending ? (
          <Pressable onPress={() => onChange({ ...value, file_path: null, file_name: null })} accessibilityRole="button" className="mt-1.5 self-start">
            <Text className="text-xs text-danger">Remove upload</Text>
          </Pressable>
        ) : null}
        <Text className="mt-1 text-xs text-ink-muted">{config.uploadNote}</Text>
      </View>

      {config.allowLink ? (
        <FormField
          label={config.linkLabel}
          value={value.url}
          onChangeText={(url) => onChange({ ...value, url })}
          placeholder={config.linkPlaceholder}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
    </View>
  );
}

export function MediaFields({ value, onChange, onError }: MediaFieldsProps) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">
        What's included <Text className="font-normal">(pick one or more)</Text>
      </Text>
      <View className="mb-3 flex-row gap-2">
        {CHANNELS.map(({ key, label, icon }) => {
          const channel = value[key];
          return (
            <Pressable
              key={key}
              onPress={() => onChange({ ...value, [key]: { ...channel, enabled: !channel.enabled } })}
              accessibilityRole="switch"
              accessibilityState={{ checked: channel.enabled }}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${channel.enabled ? "border-accent bg-accent" : "border-border bg-surface"}`}
            >
              <Icon as={icon} size={14} className={channel.enabled ? "text-canvas" : "text-ink-muted"} />
              <Text className={`text-sm font-medium ${channel.enabled ? "text-canvas" : "text-ink-muted"}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {CHANNELS.filter((c) => value[c.key].enabled).map((config) => (
        <MediaChannelFields key={config.key} config={config} value={value[config.key]} onChange={(channel) => onChange({ ...value, [config.key]: channel })} onError={onError} />
      ))}

      {!value.audio.enabled && !value.video.enabled && !value.image.enabled ? (
        <Text className="text-xs text-ink-muted">Turn on Audio, Video, Image, or any combination to continue.</Text>
      ) : null}
    </View>
  );
}
