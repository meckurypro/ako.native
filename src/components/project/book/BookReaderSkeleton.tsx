// src/components/project/book/BookReaderSkeleton.tsx
// What the reader shows while the book's chapters are still arriving: the same header, cover and title the
// contents screen will have (so they appear instantly and nothing shifts), with pulsing rows where the chapter
// list goes. Replaces opening the reader empty, which read "0 sections · about 0 min read".
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

export function BookReaderSkeleton({ title, thumbnailUrl }: { title?: string; thumbnailUrl?: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={title ?? ""} bar />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} scrollEnabled={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        <View className="items-center gap-3 pb-6 pt-8" accessibilityRole="progressbar" accessibilityLabel="Loading book">
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={{ width: 144, aspectRatio: 2 / 3, borderRadius: 8 }} contentFit="cover" />
          ) : (
            <Skeleton className="aspect-[2/3] w-36 rounded-lg" />
          )}
          {title ? (
            <Text className="mt-2 text-center font-display text-xl text-ink">{title}</Text>
          ) : (
            <Skeleton className="mt-2 h-6 w-48 rounded" />
          )}
          <Skeleton className="h-3 w-40 rounded" />
          <Skeleton className="mt-1 h-10 w-40 rounded-full" />
        </View>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} className={`flex-row items-center gap-3 px-1 py-3.5 ${i === 0 ? "" : "border-t border-border"}`}>
            <View className="min-w-0 flex-1 gap-2">
              <Skeleton className="h-2.5 w-16 rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
            </View>
            <Skeleton className="h-3 w-10 rounded" />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
