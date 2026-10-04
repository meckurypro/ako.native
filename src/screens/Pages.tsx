// src/screens/Pages.tsx
// "Account mode": switch between your personal account and any Page you can act
// as, and answer pending Page invites.
import { Check, X } from "lucide-react-native";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountModeSwitcher } from "@/components/account/AccountModeSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { usePagesFeatureSettings } from "@/hooks/useAdmin";
import { useMyPendingPageInvites, useRespondToPageInvite } from "@/hooks/usePages";
import { pageModeLabel } from "@/lib/pageRoles";

export function Pages() {
  const insets = useSafeAreaInsets();
  const { data: invites } = useMyPendingPageInvites();
  const respond = useRespondToPageInvite();
  const { data: pagesFeature } = usePagesFeatureSettings();
  const toast = useToast();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Account mode" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-md self-center">
          {invites && invites.length > 0 ? (
            <View className="mb-6">
              <Text className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Pending invites</Text>
              <View className="overflow-hidden rounded-2xl bg-surface">
                {invites.map((invite, i) => (
                  <View key={invite.id} className={`flex-row items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}>
                    <Avatar src={invite.page.avatar_url} name={invite.page.name} size="md" />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-medium text-ink">
                        {invite.page.name}
                      </Text>
                      <Text numberOfLines={1} className="text-xs text-ink-muted">
                        Invited as {invite.role_label} · {pageModeLabel(invite.page.page_type)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Decline"
                      onPress={() =>
                        respond.mutate({ page_id: invite.page_id, accept: false }, { onSuccess: () => toast(`Declined ${invite.page.name}.`, { variant: "success" }) })
                      }
                      disabled={respond.isPending}
                      hitSlop={6}
                      className="h-8 w-8 items-center justify-center rounded-full"
                    >
                      <Icon as={X} size={16} className="text-ink-muted" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Accept"
                      onPress={() =>
                        respond.mutate({ page_id: invite.page_id, accept: true }, { onSuccess: () => toast(`Joined ${invite.page.name}.`, { variant: "success" }) })
                      }
                      disabled={respond.isPending}
                      hitSlop={6}
                      className="h-8 w-8 items-center justify-center rounded-full bg-accent-soft"
                    >
                      <Icon as={Check} size={16} className="text-accent" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Text className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Switch account mode</Text>
          <AccountModeSwitcher />

          <Text className="mt-4 px-1 text-xs text-ink-muted">
            While you're acting as a page, your posts, name, and photo show its instead of yours — everyone managing it shares the same page.
            {(pagesFeature?.pages_creation_enabled ?? true) ? (
              <>
                {" "}
                <TextLink onPress={() => router.push("/pages/new")} className="text-accent">
                  Set one up
                </TextLink>
                .
              </>
            ) : null}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
