// src/components/profile/ProfileShareScreen.tsx
// Full-screen QR card for a profile (or any shareable link): avatar, name,
// handle and a scannable code, with Copy link / Share link underneath.
import { ArrowLeft, Link2, Share2 } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Portal } from "@/components/ui/Portal";
import { QrCode } from "@/components/ui/QrCode";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";

interface ProfileShareScreenProps {
  name: string;
  handle: string;
  avatarUrl: string | null;
  url: string;
  onClose: () => void;
}

export function ProfileShareScreen({ name, handle, avatarUrl, url, onClose }: ProfileShareScreenProps) {
  useBackDismiss(onClose);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  async function handleCopyLink() {
    await Clipboard.setStringAsync(url);
    toast("Link copied.", { variant: "success" });
  }

  async function handleShareLink() {
    try {
      await Share.share({ message: url, url, title: name });
    } catch {
      /* dismissed */
    }
  }

  return (
    <Portal zIndex={75}>
      <View className="flex-1 bg-canvas">
        <View className="flex-row items-center px-4 pb-2" style={{ paddingTop: insets.top + 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="-ml-2 p-2">
            <Icon as={ArrowLeft} size={22} className="text-ink" />
          </Pressable>
        </View>

        <View className="-mt-10 flex-1 items-center justify-center px-6">
          <View
            className="w-full max-w-xs items-center rounded-3xl border border-border bg-surface p-6"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 }}
          >
            <Avatar src={avatarUrl} name={name} size="xl" />
            <Text className="mt-3 text-center text-lg font-medium text-ink">{name}</Text>
            <Text className="mb-5 text-sm text-ink-muted">@{handle}</Text>
            <View className="items-center justify-center overflow-hidden rounded-2xl bg-white">
              <QrCode value={url} size={224} />
            </View>
          </View>
        </View>

        <View className="flex-row gap-3 px-6" style={{ paddingBottom: insets.bottom + 24 }}>
          <Pressable onPress={() => void handleCopyLink()} accessibilityRole="button" className="flex-1 items-center gap-2 rounded-2xl border border-border bg-surface py-4 active:opacity-80">
            <Icon as={Link2} size={20} className="text-ink" />
            <Text className="text-sm font-medium text-ink">Copy link</Text>
          </Pressable>
          <Pressable onPress={() => void handleShareLink()} accessibilityRole="button" className="flex-1 items-center gap-2 rounded-2xl border border-border bg-surface py-4 active:opacity-80">
            <Icon as={Share2} size={20} className="text-ink" />
            <Text className="text-sm font-medium text-ink">Share link</Text>
          </Pressable>
        </View>
      </View>
    </Portal>
  );
}
