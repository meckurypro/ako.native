// src/components/room/RoomCallView.tsx
// PLACEHOLDER for the in-cohort video call. The call itself needs @livekit/react-native (native
// WebRTC), which only runs in an EAS dev build — it lands with the LiveKit step
// (see src/_pending/useLiveKitRoom.ts). Keep this component's props: the real one replaces it 1:1.
import { PhoneOff, Video } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { RoomMeeting } from "@/hooks/useRoom";

export function RoomCallView({ roomMeeting, onLeave }: { roomMeeting: RoomMeeting; isHost: boolean; onLeave: () => void }) {
  return (
    <View className="items-center gap-3 rounded-xl border border-border bg-surface p-6">
      <Icon as={Video} size={26} className="text-ink-muted" />
      <Text className="text-center font-medium text-ink">{roomMeeting.title || "Cohort meeting"}</Text>
      <Text className="text-center text-sm text-ink-muted">Video calls aren't available in the app yet. You can join this meeting from the web for now.</Text>
      <Pressable onPress={onLeave} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-surface px-4 py-2">
        <Icon as={PhoneOff} size={14} className="text-ink-muted" />
        <Text className="text-sm font-medium text-ink-muted">Back</Text>
      </Pressable>
    </View>
  );
}
