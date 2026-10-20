// src/components/post/ReactionTray.tsx
// The row under every post: Like fixed on the left (with the comment count
// beneath it), the ranked secondary actions in the middle, "more" on the right.
// Holding ANY button opens the full action sheet (onOpenMore) — the same
// shortcut as web's long-press.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AnimatedCount } from "@/components/ui/AnimatedCount";
import { Text } from "@/components/ui/Text";
import { haptics } from "@/lib/haptics";

export interface EngagementAction {
  key: string;
  /** Accessibility label on the tray icon; also the visible label in the long-press sheet. */
  label: string;
  icon: ReactNode;
  count: number | null;
  onClick: () => void;
}

interface ReactionTrayProps {
  leftActions: EngagementAction[];
  middleActions: EngagementAction[];
  rightActions: EngagementAction[];
  /** Small tappable caption under the left action (e.g. "Comments: 4"). */
  belowLeftLabel?: { text: string; /** Rolling number shown after the text (e.g. the comment count). */ count?: number; onClick: () => void };
  /** Open the full "more" sheet — fired by a long-press on any button. */
  onOpenMore?: () => void;
  /** Frozen (archived / reshare whose original is gone): everything dimmed and inert. */
  disabled?: boolean;
}

// The tray is laid out on a 5-slot grid: left + middle + right slots share the row.
const VISIBLE_SLOTS = 5;
const LONG_PRESS_MS = 450;

// The icon owns a fixed box in the middle of its slot and the count hangs off the box's right edge, outside the
// layout flow. Because the count takes no part in centring, the icon sits in exactly the same place whether the
// count is hidden (0), one digit or "1.2K" — it never shifts when the number appears, grows or disappears.
const ICON_BOX = 24;
const COUNT_GAP = 6;

function ActionButton({
  action,
  widthPercent,
  onOpenMore,
  disabled,
}: {
  action: EngagementAction;
  widthPercent: number;
  onOpenMore?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) action.onClick();
      }}
      // Pressable cancels the long-press itself once the finger drifts into a scroll.
      onLongPress={
        onOpenMore && !disabled
          ? () => {
              haptics.light();
              onOpenMore();
            }
          : undefined
      }
      delayLongPress={LONG_PRESS_MS}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: !!disabled }}
      className={`flex-row items-center justify-center py-1.5 ${disabled ? "opacity-40" : ""}`}
      style={{ width: `${widthPercent}%` }}
    >
      <View style={{ width: ICON_BOX, height: ICON_BOX, alignItems: "center", justifyContent: "center" }}>{action.icon}</View>
      {action.count !== null ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, bottom: 0, left: "50%", marginLeft: ICON_BOX / 2 + COUNT_GAP, justifyContent: "center" }}
        >
          <AnimatedCount value={action.count} lineHeight={18} className="text-sm font-semibold text-ink" />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ReactionTray({ leftActions, middleActions, rightActions, onOpenMore, belowLeftLabel, disabled }: ReactionTrayProps) {
  const slotPct = 100 / VISIBLE_SLOTS;
  const middleSlotCount = Math.max(0, VISIBLE_SLOTS - leftActions.length - rightActions.length);
  const middleItemWidth = 100 / Math.max(middleActions.length, 1);

  return (
    <View className="mt-4 w-full flex-row items-start pb-1 pt-4">
      <View className="shrink-0 items-center" style={{ width: `${leftActions.length * slotPct}%` }}>
        <View className="w-full flex-row">
          {leftActions.map((action) => (
            <ActionButton key={action.key} action={action} widthPercent={100 / leftActions.length} onOpenMore={onOpenMore} disabled={disabled} />
          ))}
        </View>

        {belowLeftLabel ? (
          // Fixed, wider-than-slot width so the label never wraps (web uses whitespace-nowrap);
          // it overflows the narrow left slot evenly on both sides, centred under the Like button.
          <Pressable
            onPress={belowLeftLabel.onClick}
            hitSlop={8}
            accessibilityRole="button"
            className="mt-2 items-center"
            style={{ width: 140 }}
          >
            <View className="flex-row items-center justify-center gap-1">
              <Text numberOfLines={1} className="text-xs font-medium leading-none text-ink-muted">{belowLeftLabel.text}</Text>
              {belowLeftLabel.count !== undefined ? (
                <AnimatedCount value={belowLeftLabel.count} showZero lineHeight={14} className="text-xs font-medium text-ink-muted" />
              ) : null}
            </View>
          </Pressable>
        ) : null}
      </View>

      <View className="shrink-0 flex-row" style={{ width: `${middleSlotCount * slotPct}%` }}>
        {middleActions.map((action) => (
          <ActionButton key={action.key} action={action} widthPercent={middleItemWidth} onOpenMore={onOpenMore} disabled={disabled} />
        ))}
      </View>

      <View className="shrink-0 flex-row" style={{ width: `${rightActions.length * slotPct}%` }}>
        {rightActions.map((action) => (
          <ActionButton key={action.key} action={action} widthPercent={100 / rightActions.length} onOpenMore={onOpenMore} disabled={disabled} />
        ))}
      </View>
    </View>
  );
}
