// src/components/post/ReactionMoreSheet.tsx
// Every engagement action for the post, opened from the tray's "more" button or a long-press — as the shared centred
// options list. Actions run only after the dismiss settles (OptionsModal → runAfterDismiss).
import { View } from "react-native";

import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { Text } from "@/components/ui/Text";
import type { EngagementAction } from "./ReactionTray";

export function ReactionMoreSheet({ actions, onClose }: { actions: EngagementAction[]; onClose: () => void }) {
  const items: OptionItem[] = actions.map((action) => ({
    key: action.key,
    label: action.label,
    icon: action.icon,
    badge: action.count ? (
      <View>
        <Text className="text-sm text-overlay-ink-muted">{action.count}</Text>
      </View>
    ) : undefined,
    onSelect: () => action.onClick(),
  }));
  return <OptionsModal title="More actions" items={items} onClose={onClose} />;
}
