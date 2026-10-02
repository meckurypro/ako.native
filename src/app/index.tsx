// File: src/app/index.tsx
// Temporary foundation screen — proves tokens, fonts, dark mode and page mode
// work end to end. Replaced by the real feed in step 6.
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { useTheme, type ThemeSetting } from "@/theme/ThemeProvider";

const OPTIONS: ThemeSetting[] = ["light", "dark", "system"];

export default function Foundation() {
  const insets = useSafeAreaInsets();
  const { theme, setTheme, pageMode, setPageMode } = useTheme();

  return (
    <View className="flex-1 bg-canvas px-5" style={{ paddingTop: insets.top + 24 }}>
      <Text className="font-display text-4xl font-bold text-ink">Akọ</Text>
      <Text className="mt-1 text-ink-muted">A reason to reason</Text>

      <View className="mt-8 rounded-2xl border border-border bg-surface p-4">
        <Text className="font-display text-xl font-semibold italic text-post-header">
          Foundation check
        </Text>
        <Text className="mt-2 text-ink">
          Inter body text. <Text className="font-bold">Bold span</Text> inherits the family.
        </Text>
        <Text className="mt-2 font-simple text-ink-muted">Roboto, the plain sans.</Text>
      </View>

      <View className="mt-6 flex-row gap-2">
        {OPTIONS.map((o) => (
          <Pressable
            key={o}
            onPress={() => setTheme(o)}
            className={`rounded-full px-4 py-2 ${theme === o ? "bg-accent" : "bg-accent-soft"}`}
          >
            <Text className={theme === o ? "font-medium text-surface" : "font-medium text-ink"}>
              {o}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setPageMode(!pageMode)}
        className="mt-3 self-start rounded-full border border-border px-4 py-2"
      >
        <Text className="font-medium text-ink">Page mode: {pageMode ? "on" : "off"}</Text>
      </Pressable>
    </View>
  );
}
