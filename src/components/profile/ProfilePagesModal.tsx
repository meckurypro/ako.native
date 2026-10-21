// src/components/profile/ProfilePagesModal.tsx
// The pages (organisations / brands / products) a person is affiliated with, each with the page's avatar and the
// person's role there. Modal caps the card at 85% of the screen and scrolls its content, so a long list scrolls.
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import type { ProfilePageAffiliation } from "@/hooks/usePages";

export function ProfilePagesModal({ pages, onClose }: { pages: ProfilePageAffiliation[]; onClose: () => void }) {
  return (
    <Modal onClose={onClose} ariaLabel="Pages">
      <Text className="text-lg font-semibold text-overlay-ink">Pages</Text>
      <View className="-mx-2 mt-3">
        {pages.map((p) => (
          <Pressable
            key={p.page_id}
            onPress={() => runAfterDismiss(onClose, () => router.push(`/page/${p.username}` as Href))}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${p.role_label}`}
            className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised"
          >
            <Avatar src={p.avatar_url} name={p.name} size="vn" />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text numberOfLines={1} className="shrink font-medium text-overlay-ink">{p.name}</Text>
                {p.is_verified ? <VerifiedBadge className="shrink-0" /> : null}
              </View>
              <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">{p.role_label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}
