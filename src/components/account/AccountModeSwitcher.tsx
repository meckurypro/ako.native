// src/components/account/AccountModeSwitcher.tsx
// Personal account + every Page you can act as; the active one is ticked.
// Switching swaps the whole app identity (palette included) and lands on the
// matching profile. Used on the Pages screen.
import { Check, Plus } from "lucide-react-native";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { usePagesFeatureSettings } from "@/hooks/useAdmin";
import { useActiveIdentity, useMyPages, useSwitchActiveMode } from "@/hooks/usePages";
import { useMyProfile } from "@/hooks/useProfile";
import { haptics } from "@/lib/haptics";
import { pageModeLabel } from "@/lib/pageRoles";

function Row({
  avatarSrc,
  name,
  title,
  subtitle,
  active,
  disabled,
  onPress,
}: {
  avatarSrc: string | null | undefined;
  name: string;
  title: string;
  subtitle: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-3 p-4 active:bg-border/40"
    >
      <Avatar src={avatarSrc} name={name} size="md" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-ink-muted">
          {subtitle}
        </Text>
      </View>
      {active ? <Icon as={Check} size={18} className="shrink-0 text-accent" /> : null}
    </Pressable>
  );
}

export function AccountModeSwitcher() {
  const { data: me } = useMyProfile();
  const { data: identity } = useActiveIdentity();
  const { data: pages } = useMyPages();
  const switchMode = useSwitchActiveMode();
  const { data: pagesFeature } = usePagesFeatureSettings();

  const isPersonalActive = !identity || identity.mode === "personal";

  function switchTo(pageId: string | null) {
    haptics.selection();
    switchMode.mutate(pageId, { onSuccess: () => router.replace("/me") });
  }

  return (
    <View className="overflow-hidden rounded-2xl bg-surface">
      <Row
        avatarSrc={me?.avatar_url}
        name={me?.display_name ?? "You"}
        title={me?.display_name ?? ""}
        subtitle="Personal account"
        active={isPersonalActive}
        disabled={switchMode.isPending}
        onPress={() => !isPersonalActive && switchTo(null)}
      />

      {pages?.map((page) => {
        const isActive = identity?.mode === "page" && identity.page.id === page.id;
        return (
          <View key={page.id} className="border-t border-border">
            <Row
              avatarSrc={page.avatar_url}
              name={page.name}
              title={page.name}
              subtitle={`${page.my_role_label} · ${pageModeLabel(page.page_type)}`}
              active={isActive}
              disabled={switchMode.isPending}
              onPress={() => !isActive && switchTo(page.id)}
            />
          </View>
        );
      })}

      {/* Admin kill switch — only ever hides starting a NEW page. Existing pages above stay switchable. */}
      {(pagesFeature?.pages_creation_enabled ?? true) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/pages/new")}
          className="flex-row items-center gap-3 border-t border-border p-4 active:bg-border/40"
        >
          <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <Icon as={Plus} size={18} className="text-accent" />
          </View>
          <Text className="text-sm font-medium text-accent">Create a page</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
