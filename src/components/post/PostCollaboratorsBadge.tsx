// src/components/post/PostCollaboratorsBadge.tsx
// Small "people" badge on a post avatar when it has accepted collaborators;
// tapping lists them in an anchored popover.
import { Users } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { PopoverPanel } from "@/components/ui/OverlayPanel";
import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useCollaborators, type CollaborationTarget } from "@/hooks/useCollaboration";

const PANEL_WIDTH = 224; // w-56

export function PostCollaboratorsBadge({
  target,
  targetId,
  side = "right",
}: {
  target: CollaborationTarget;
  targetId: string;
  /** Which bottom corner of the avatar it sits on — "left" when another mark (Verified) takes the right. */
  side?: "left" | "right";
}) {
  const { data: collaborators } = useCollaborators(target, targetId);
  const accepted = (collaborators ?? []).filter((c) => c.status === "accepted");
  const { width: windowW } = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = pos !== null;
  useBackDismiss(() => setPos(null), open);

  if (accepted.length === 0) return null;

  function openPopover() {
    anchorRef.current?.measureInWindow((x, y, _w, h) => {
      setPos({ top: y + h + 6, left: Math.min(Math.max(8, x - 8), windowW - PANEL_WIDTH - 8) });
    });
  }

  return (
    <>
      <Pressable
        ref={anchorRef}
        collapsable={false}
        onPress={openPopover}
        accessibilityRole="button"
        accessibilityLabel={`Posted with ${accepted.length} ${accepted.length === 1 ? "collaborator" : "collaborators"}`}
        className={`absolute -bottom-1 ${side === "left" ? "-left-1" : "-right-1"} h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-accent`}
      >
        <Icon as={Users} size={11} strokeWidth={2.5} className="text-canvas" />
      </Pressable>

      {open ? (
        <Portal zIndex={50}>
          <Pressable className="absolute inset-0" onPress={() => setPos(null)} accessibilityLabel="Close" />
          <View style={{ position: "absolute", top: pos.top, left: pos.left, width: PANEL_WIDTH }}>
            <PopoverPanel tone="canvas" className="rounded-xl py-2">
              <Text className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Posted with</Text>
              {accepted.map((c) => (
                <Pressable
                  key={c.user.id}
                  onPress={() => {
                    setPos(null);
                    router.push(`/profile/${c.user.username}` as Href);
                  }}
                  className="flex-row items-center gap-2.5 px-3 py-2 active:bg-surface"
                >
                  <Avatar src={c.user.avatar_url} name={c.user.display_name} size="sm" />
                  <Text numberOfLines={1} className="flex-1 text-sm text-ink">
                    {c.user.display_name}
                  </Text>
                </Pressable>
              ))}
            </PopoverPanel>
          </View>
        </Portal>
      ) : null}
    </>
  );
}
