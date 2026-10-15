// src/components/project/SupportingImagesField.tsx
//
// Create/Edit project: up to 4 extra images that visitors swipe through on the
// project's own page (after the thumbnail). Reuses the thumbnail uploader/bucket.
import { ChevronLeft, ChevronRight, Image as ImageIcon, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { pickImages } from "@/lib/pickImage";
import { MAX_SUPPORTING_IMAGES } from "@/lib/projectImages";

export function SupportingImagesField({
  urls,
  onChange,
  hasThumbnail,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
  hasThumbnail: boolean;
}) {
  const upload = useUploadProjectThumbnail();
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_SUPPORTING_IMAGES - urls.length;
  const busy = pending > 0;

  async function handleAdd() {
    if (busy || remaining <= 0) return;
    const files = await pickImages({ limit: remaining });
    if (files.length === 0) return;

    setError(null);
    setPending(files.length);
    const added: string[] = [];
    for (const file of files) {
      try {
        const { url } = await upload.mutateAsync(file);
        added.push(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Image upload failed.");
        break;
      } finally {
        setPending((p) => Math.max(0, p - 1));
      }
    }
    if (added.length > 0) onChange([...urls, ...added].slice(0, MAX_SUPPORTING_IMAGES));
  }

  function remove(i: number) {
    onChange(urls.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  // Four fixed slots so tiles keep one size however many images there are.
  const slots = Array.from({ length: MAX_SUPPORTING_IMAGES }, (_, i) => {
    if (i < urls.length) return { kind: "image" as const, url: urls[i] };
    if (i < urls.length + pending) return { kind: "pending" as const };
    if (i === urls.length + pending) return { kind: "add" as const };
    return { kind: "empty" as const };
  });

  return (
    <View className="mb-4">
      <View className="mb-1.5 flex-row items-baseline justify-between">
        <Text className="text-sm font-medium text-ink-muted">Supporting images</Text>
        <Text className="text-xs text-ink-muted">{`${urls.length}/${MAX_SUPPORTING_IMAGES}`}</Text>
      </View>

      {!hasThumbnail ? (
        <View className="rounded-xl border border-dashed border-border px-4 py-3">
          <Text className="text-sm text-ink-muted">Add a thumbnail first. Supporting images appear when people swipe it on the project page.</Text>
        </View>
      ) : (
        <>
          <View className="flex-row gap-2">
            {slots.map((slot, i) => {
              if (slot.kind === "image") {
                return (
                  <View key={`${i}-${slot.url}`} style={{ flex: 1, aspectRatio: 1 }} className="overflow-hidden rounded-xl border border-border bg-surface">
                    <Image source={{ uri: slot.url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                    <Pressable
                      onPress={() => remove(i)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove image ${i + 1}`}
                      className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-ink-a70"
                    >
                      <Icon as={X} size={12} className="text-canvas" />
                    </Pressable>
                    {urls.length > 1 ? (
                      <View className="absolute bottom-1 left-1 right-1 flex-row justify-between">
                        <Pressable
                          onPress={() => move(i, -1)}
                          disabled={i === 0}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Move earlier"
                          className="h-6 w-6 items-center justify-center rounded-full bg-ink-a70"
                          style={{ opacity: i === 0 ? 0.3 : 1 }}
                        >
                          <Icon as={ChevronLeft} size={12} className="text-canvas" />
                        </Pressable>
                        <Pressable
                          onPress={() => move(i, 1)}
                          disabled={i === urls.length - 1}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Move later"
                          className="h-6 w-6 items-center justify-center rounded-full bg-ink-a70"
                          style={{ opacity: i === urls.length - 1 ? 0.3 : 1 }}
                        >
                          <Icon as={ChevronRight} size={12} className="text-canvas" />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              }
              if (slot.kind === "pending") {
                return (
                  <View key={`pending-${i}`} style={{ flex: 1, aspectRatio: 1 }} className="items-center justify-center rounded-xl border border-border bg-surface">
                    <ActivityIndicator />
                  </View>
                );
              }
              if (slot.kind === "add") {
                return (
                  <Pressable
                    key="add"
                    onPress={() => void handleAdd()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Add supporting images"
                    style={{ flex: 1, aspectRatio: 1 }}
                    className="items-center justify-center rounded-xl border border-dashed border-border"
                  >
                    <Icon as={urls.length === 0 ? ImageIcon : Plus} size={20} className="text-ink-muted" />
                  </Pressable>
                );
              }
              return <View key={`empty-${i}`} style={{ flex: 1, aspectRatio: 1 }} />;
            })}
          </View>
          <Text className="mt-2 text-xs text-ink-muted">
            Visitors swipe your thumbnail to see these on the project page. They're cropped to the thumbnail's shape and never shown in lists.
          </Text>
        </>
      )}
      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
