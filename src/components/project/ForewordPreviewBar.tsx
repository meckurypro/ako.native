// src/components/project/ForewordPreviewBar.tsx
// A slim bar shown to someone invited to write a foreword while they read the book or course: a reminder of why they
// can see it, and a one-tap way to write (or edit) the foreword without leaving. Mirrors the web bar.
import { PenLine } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { isInviteOpen, useMyForeword } from "@/hooks/useForewords";
import { ForewordInviteModal } from "./ForewordInviteModal";

export function ForewordPreviewBar({ projectId, isOwner = false }: { projectId: string; isOwner?: boolean }) {
  const insets = useSafeAreaInsets();
  const { data: foreword } = useMyForeword(isOwner ? undefined : projectId);
  const [open, setOpen] = useState(false);

  const invited = !!foreword && isInviteOpen(foreword);
  const pending = foreword?.status === "submitted";
  if (isOwner || !foreword || (!invited && !pending)) return null;

  return (
    <>
      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 px-4" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="flex-row items-center gap-3 self-center rounded-2xl border border-border bg-surface px-4 py-2.5" style={{ maxWidth: 448, elevation: 8 }}>
          <Text className="min-w-0 flex-1 text-xs text-ink-muted">{invited ? "You're previewing this to write a foreword." : "Your foreword is with the creator for review."}</Text>
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button" className="shrink-0 flex-row items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5">
            <Icon as={PenLine} size={13} className="text-canvas" />
            <Text className="text-xs font-medium text-canvas">{invited ? "Write it" : "View"}</Text>
          </Pressable>
        </View>
      </View>
      {open ? <ForewordInviteModal projectId={projectId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
