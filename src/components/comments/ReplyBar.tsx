// src/components/comments/ReplyBar.tsx
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { useMyProfile } from "@/hooks/useProfile";
import { useActiveIdentity } from "@/hooks/usePages";
import type { Stance } from "@/types/database";
import { STANCE_ORDER, STANCE_TONE } from "./stance";

/**
 * The always-visible "say something" row under a post or an opened comment. Tapping the field opens the
 * composer on Support; the three small words open it straight on that stance. `stances` narrows what's offered
 * (a post's own author can only add to their own post, so they only get Support).
 */
export function ReplyBar({
  placeholder,
  stances = STANCE_ORDER,
  onOpen,
}: {
  placeholder: string;
  stances?: Stance[];
  onOpen: (stance: Stance) => void;
}) {
  const { data: me } = useMyProfile();
  const { data: identity } = useActiveIdentity();
  const page = identity?.mode === "page" ? identity.page : null;
  const name = page?.name ?? me?.display_name ?? "";
  const avatar = page?.avatar_url ?? me?.avatar_url ?? null;

  return (
    <View className="flex-row items-center gap-3 border-b border-border py-3">
      <Avatar src={avatar} name={name || "You"} size="sm" />
      <Pressable onPress={() => onOpen(stances[0])} accessibilityRole="button" className="min-w-0 flex-1 py-1">
        <Text numberOfLines={1} className="text-[15px] text-ink-muted">
          {placeholder}
        </Text>
      </Pressable>
      {stances.length > 1 ? (
        <View className="flex-shrink-0 flex-row items-center gap-3">
          {stances.map((s) => (
            <Pressable key={s} onPress={() => onOpen(s)} accessibilityRole="button" hitSlop={6} className="active:opacity-60">
              <Text className={`text-xs font-medium ${STANCE_TONE[s].text}`}>{STANCE_TONE[s].noun}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
