// src/components/nav/OfflineBanner.tsx
// App-wide "you're offline" pill with a shortcut to the Library, where everything downloaded lives. Rendered once by
// the (app) layout, just above the bottom nav. Without it, someone who opens the app with no signal lands on screens
// that can't load and has no hint that their downloaded books and files are one tap away.
//
// Waits a couple of seconds before appearing so a momentary dip doesn't flash it, and hides itself on the Library.
import { router, usePathname, type Href } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useIsOnline } from "@/hooks/useIsOnline";

const SHOW_AFTER_MS = 2000;

export function OfflineBanner() {
  const online = useIsOnline();
  const pathname = usePathname();
  const bottom = useBottomNavInset();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (online) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [online]);

  if (!show || pathname === "/library" || pathname.startsWith("/library/")) return null;

  return (
    // box-none: the strip itself never swallows touches meant for the screen underneath.
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom, zIndex: 35 }} className="items-center px-4">
      <Pressable
        onPress={() => router.push("/library" as Href)}
        accessibilityRole="button"
        accessibilityLabel="You're offline. Open your downloads."
        className="flex-row items-center gap-2 rounded-full border border-border bg-surface px-4 py-2"
        style={{ elevation: 3 }}
      >
        <Icon as={WifiOff} size={14} className="text-ink-muted" />
        <Text className="text-xs text-ink-muted">Offline</Text>
        <Text className="text-xs font-medium text-accent">Open downloads</Text>
      </Pressable>
    </View>
  );
}
