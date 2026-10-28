// src/screens/CreateChoice.tsx
// "+" menu: Post or Project. Presented as a transparent modal over whatever
// screen opened it (see (app)/_layout), so it needs its own PortalHost — a
// native modal sits above the app's root overlay layer.
import { ChevronRight, FolderPlus, PenSquare, X, type LucideIcon } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";

import { BrandDot } from "@/components/ui/BrandDot";
import { PortalHost } from "@/components/ui/Portal";
import { Sheet, useSheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useSmartBack } from "@/hooks/useSmartBack";

const CHOICES: { to: string; icon: LucideIcon; label: string; description: string }[] = [
  { to: "/compose", icon: PenSquare, label: "Post", description: "Share a thought with your followers" },
  { to: "/projects/new", icon: FolderPlus, label: "Project", description: "List a file, event, course, or paid link" },
];

function Body({ onPick }: { onPick: (to: string) => void }) {
  const { close } = useSheet();
  const projectsEnabled = useFeatureFlag("projects_enabled");
  const choices = projectsEnabled ? CHOICES : CHOICES.filter((c) => c.to !== "/projects/new");

  return (
    <>
      <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-lg font-semibold text-ink">Create</Text>
          <BrandDot />
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={22} className="text-ink-muted" />
        </Pressable>
      </View>

      <View className="px-3 pb-2">
        {choices.map(({ to, icon, label, description }) => (
          <Pressable
            key={to}
            onPress={() => {
              onPick(to);
              close();
            }}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-2xl px-3 py-3.5 active:bg-surface"
          >
            <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <Icon as={icon} size={20} className="text-accent" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-ink">{label}</Text>
              <Text numberOfLines={1} className="text-xs text-ink-muted">
                {description}
              </Text>
            </View>
            <Icon as={ChevronRight} size={18} className="shrink-0 text-ink-muted" />
          </Pressable>
        ))}
      </View>
    </>
  );
}

// Sheet.close() slides the panel out and THEN calls onClose (which is router.back()
// for a scrim tap / Back / swipe). If a choice navigated on its own timer while that
// slide-out was still running, the stale onClose would fire afterwards and pop the
// screen we had just opened — Compose / New project flashed and vanished. So a choice
// only records its target; the single navigation happens in onClose, after the
// slide-out, and replaces back(). The timer is a safety net in case the animation
// callback never fires; `settled` guarantees only one of the two runs.
const SLIDE_OUT_MS = 140; // Sheet's exit animation (ANIM_MS - 40)
const FALLBACK_MS = SLIDE_OUT_MS + 200;

export function CreateChoice() {
  const back = useSmartBack();
  const target = useRef<string | null>(null);
  const settled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settle = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    if (timer.current) clearTimeout(timer.current);
    const to = target.current;
    if (to) router.replace(to as Href);
    else back();
  }, [back]);

  const onPick = useCallback(
    (to: string) => {
      if (target.current) return; // already choosing — ignore a double tap
      target.current = to;
      timer.current = setTimeout(settle, FALLBACK_MS);
    },
    [settle]
  );

  return (
    <PortalHost>
      <View className="flex-1">
        <Sheet dismissKeyboardOnOpen onClose={settle} accessibilityLabel="Create">
          <Body onPick={onPick} />
        </Sheet>
      </View>
    </PortalHost>
  );
}
