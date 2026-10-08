// src/components/messages/MediaComposeModal.tsx
// The screen WhatsApp shows between picking media and sending it: a full-bleed preview,
// a thumbnail strip for albums (tap to switch, ✕ to remove), an HD toggle for photos, and a
// caption bar with the send button (badged with the item count when sending several).
import { Image } from "expo-image";
import { FileText, Send, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { MAX_CAPTION_LENGTH, documentStyle, formatFileSize, type MediaKind } from "@/lib/chatMedia";
import type { LocalFile } from "@/lib/localFile";

interface MediaComposeModalProps {
  kind: MediaKind;
  files: LocalFile[];
  onClose: () => void;
  onSend: (files: LocalFile[], caption: string, hd: boolean) => void;
}

export function MediaComposeModal({ kind, files: initialFiles, onClose, onSend }: MediaComposeModalProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const [files, setFiles] = useState(initialFiles);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [hd, setHd] = useState(false);
  useBackDismiss(onClose, true);

  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) }));
  const current = files[Math.min(index, files.length - 1)];

  function remove(i: number) {
    if (files.length === 1) {
      onClose();
      return;
    }
    setFiles((prev) => prev.filter((_, n) => n !== i));
    setIndex((prev) => Math.max(0, Math.min(prev, files.length - 2)));
  }

  if (!current) return null;
  const doc = kind === "document" ? documentStyle(current.name, current.type) : null;

  return (
    <Portal zIndex={60}>
      <Animated.View style={[{ flex: 1 }, rootStyle]} className="bg-black">
        <View className="flex-row items-center justify-between px-2" style={{ paddingTop: insets.top + 6 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} className="p-3">
            <Icon as={X} size={24} color="#FFFFFF" />
          </Pressable>
          {kind === "image" ? (
            <Pressable
              onPress={() => setHd((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: hd }}
              accessibilityLabel="Send in HD quality"
              className={`mr-2 rounded-full px-3 py-1.5 ${hd ? "bg-white" : "bg-white/20"}`}
            >
              <Text className={`text-xs font-bold ${hd ? "text-black" : "text-white"}`}>HD</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="min-h-0 flex-1 items-center justify-center">
          {kind === "image" ? (
            <Image source={{ uri: current.uri }} contentFit="contain" style={{ width: "100%", height: "100%" }} transition={120} />
          ) : (
            <View className="items-center gap-4 px-8">
              <View className="h-24 w-24 items-center justify-center rounded-3xl" style={{ backgroundColor: doc?.color }}>
                <Icon as={FileText} size={44} color="#FFFFFF" />
                <Text className="mt-1 text-xs font-bold text-white">{doc?.label}</Text>
              </View>
              <Text numberOfLines={3} className="text-center text-base text-white">
                {current.name}
              </Text>
              <Text className="text-sm text-white/60">{[doc?.label, formatFileSize(current.size)].filter(Boolean).join(" · ")}</Text>
            </View>
          )}
        </View>

        {files.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[68px] grow-0" contentContainerClassName="gap-2 px-3 py-2">
            {files.map((f, i) => (
              <Pressable key={`${f.uri}-${i}`} onPress={() => setIndex(i)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`}>
                <Image
                  source={{ uri: f.uri }}
                  contentFit="cover"
                  style={{ width: 52, height: 52, borderRadius: 8, borderWidth: i === index ? 2 : 0, borderColor: "#FFFFFF", opacity: i === index ? 1 : 0.7 }}
                />
                {i === index ? (
                  <Pressable
                    onPress={() => remove(i)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={6}
                    className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/80"
                  >
                    <Icon as={X} size={12} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View className="flex-row items-end gap-2 px-3 pb-3 pt-1">
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            multiline
            placeholder={files.length > 1 ? "Add a caption to all…" : "Add a caption…"}
            placeholderTextColor="rgba(255,255,255,0.55)"
            selectionColor="#FFFFFF"
            className="min-w-0 flex-1 rounded-3xl bg-white/15 px-4 py-2.5 text-base text-white"
            style={{ maxHeight: 110, fontFamily: "Inter_400Regular" }}
          />
          <Pressable
            onPress={() => onSend(files, caption, hd)}
            accessibilityRole="button"
            accessibilityLabel={files.length > 1 ? `Send ${files.length} items` : "Send"}
            className="h-11 w-11 items-center justify-center rounded-full bg-accent active:bg-accent-hover"
          >
            <Icon as={Send} size={20} color="#FFFFFF" />
            {files.length > 1 ? (
              <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1">
                <Text className="text-[11px] font-bold text-black">{files.length}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </Animated.View>
    </Portal>
  );
}
