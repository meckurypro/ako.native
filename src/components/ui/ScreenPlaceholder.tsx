// src/components/ui/ScreenPlaceholder.tsx
// Stand-in for screens that haven't been ported yet. Every route in the app
// exists from the navigation step onward; each build step swaps its
// placeholders for the real screen. Shows which web page it replaces, the
// build step that delivers it, and the live route params (handy for checking
// deep links).
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useSmartBack } from "@/hooks/useSmartBack";
import { Button } from "./Button";
import { Text } from "./Text";

interface Props {
  /** The web page being replaced, e.g. "PostDetail". */
  name: string;
  /** Build step that delivers the real screen. */
  step: number;
}

export function ScreenPlaceholder({ name, step }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomNavInset();
  const params = useLocalSearchParams();
  const back = useSmartBack();
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);

  return (
    <View className="flex-1 bg-canvas px-6" style={{ paddingTop: insets.top + 24, paddingBottom: bottom }}>
      <Text className="font-display text-2xl font-semibold text-ink">{name}</Text>
      <Text className="mt-1 text-ink-muted">Arrives in build step {step}.</Text>
      {entries.length > 0 ? (
        <View className="mt-4 rounded-xl border border-border bg-surface p-3">
          {entries.map(([k, v]) => (
            <Text key={k} className="text-xs text-ink-muted">
              {k}: <Text className="text-ink">{Array.isArray(v) ? v.join(", ") : String(v)}</Text>
            </Text>
          ))}
        </View>
      ) : null}
      <View className="mt-8 flex-row gap-3">
        <Button size="sm" variant="secondary" onPress={back}>
          Back
        </Button>
        <Button size="sm" onPress={() => router.replace("/feed")}>
          Feed
        </Button>
      </View>
    </View>
  );
}
