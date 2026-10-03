// src/components/post/ReactionMoreSheet.tsx
// The full action grid, opened from the tray's "more" button or a long-press.
import { Pressable, View } from "react-native";

import { Sheet, useSheet } from "@/components/ui/Sheet";
import { SheetCancel } from "@/components/ui/SheetParts";
import { Text } from "@/components/ui/Text";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import type { EngagementAction } from "./ReactionTray";

function Grid({ actions }: { actions: EngagementAction[] }) {
  const { close } = useSheet();
  return (
    <>
      <View className="flex-row flex-wrap px-2 pb-2 pt-5">
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => runAfterDismiss(close, action.onClick)}
            className="items-center gap-1.5 pb-4 active:opacity-60"
            style={{ width: "25%" }}
          >
            {action.icon}
            <Text className="px-0.5 text-center text-[11px] leading-tight text-ink-muted">
              {action.label}
              {action.count !== null ? ` (${action.count})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <SheetCancel />
    </>
  );
}

export function ReactionMoreSheet({ actions, onClose }: { actions: EngagementAction[]; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} accessibilityLabel="More actions">
      <Grid actions={actions} />
    </Sheet>
  );
}
