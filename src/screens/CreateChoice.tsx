// src/screens/CreateChoice.tsx
// "+" menu: Post or Project. Presented as a transparent modal over whatever
// screen opened it (see (app)/_layout), so it needs its own PortalHost — a
// native modal sits above the app's root overlay layer.
import { ChevronRight, FolderPlus, PenSquare, X, type LucideIcon } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { PortalHost } from "@/components/ui/Portal";
import { Sheet, useSheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useSmartBack } from "@/hooks/useSmartBack";

const CHOICES: { to: string; icon: LucideIcon; label: string; description: string }[] = [
  { to: "/compose", icon: PenSquare, label: "Post", description: "Share a thought with your followers" },
  { to: "/projects/new", icon: FolderPlus, label: "Project", description: "List a file, event, course, or paid link" },
];

function Body() {
  const { close } = useSheet();
  const projectsEnabled = useFeatureFlag("projects_enabled");
  const choices = projectsEnabled ? CHOICES : CHOICES.filter((c) => c.to !== "/projects/new");

  return (
    <>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
        <Text className="font-display text-xl text-ink">Create</Text>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={22} className="text-ink-muted" />
        </Pressable>
      </View>

      <View className="px-3 pb-2">
        {choices.map(({ to, icon, label, description }) => (
          <Pressable
            key={to}
            onPress={() => runAfterDismiss(close, () => router.replace(to as Href))}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-2xl px-3 py-3.5 active:bg-surface"
          >
            <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <Icon as={icon} size={20} className="text-accent" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-medium text-ink">{label}</Text>
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

export function CreateChoice() {
  const back = useSmartBack();
  return (
    <PortalHost>
      <View className="flex-1">
        <Sheet onClose={back} showHandle radius="3xl" accessibilityLabel="Create">
          <Body />
        </Sheet>
      </View>
    </PortalHost>
  );
}
