// src/components/nav/TopHeader.tsx
// Feed/Discover-style header: [avatar | +] — wordmark — [bell + unread].
import { Bell, Plus } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useMyProfile } from "@/hooks/useProfile";

interface TopHeaderProps {
  leftAction?: "avatar" | "create";
}

export function TopHeader({ leftAction = "avatar" }: TopHeaderProps) {
  const unreadCount = useUnreadCount();
  const { data: me } = useMyProfile();

  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-5">
      {leftAction === "create" ? (
        // Opens as a native modal over the current screen (web: the "modal route" pattern).
        <Pressable
          onPress={() => router.push("/create" as Href)}
          accessibilityRole="button"
          accessibilityLabel="Create"
          hitSlop={8}
          className="-ml-1.5 h-9 w-9 items-center justify-center rounded-full"
        >
          <Icon as={Plus} size={24} strokeWidth={2} className="text-ink-muted" />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push((me ? `/profile/${me.username}` : "/me") as Href)}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <Avatar src={me?.avatar_url} name={me?.display_name ?? "You"} size="sm" />
        </Pressable>
      )}

      <Wordmark size="sm" />

      <Pressable
        onPress={() => router.push("/notifications" as Href)}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        hitSlop={8}
      >
        <Icon as={Bell} size={22} className="text-ink-muted" />
        {unreadCount > 0 ? (
          <View className="absolute -right-1.5 -top-1.5 h-4 w-4 items-center justify-center rounded-full bg-danger">
            <Text className="text-[10px] font-medium text-canvas">{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
