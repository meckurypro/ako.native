// src/components/ui/UnavailableNotice.tsx
// Shown in place of a post or project's content once it's deleted or archived.
// `reason` should be a complete sentence ("You deleted this post."); when no
// reason can be attributed (a stranger on a dead link), omit it.
import { EyeOff } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "./styled";
import { Text } from "./Text";

export function UnavailableNotice({ kind, reason }: { kind: "post" | "project"; reason?: string | null }) {
  return (
    <View className="items-center px-6 py-16">
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
        <Icon as={EyeOff} size={20} className="text-ink-muted" />
      </View>
      <Text className="mb-1 font-medium text-ink">This {kind} is no longer available</Text>
      {reason ? <Text className="text-center text-sm text-ink-muted">{reason}</Text> : null}
    </View>
  );
}
