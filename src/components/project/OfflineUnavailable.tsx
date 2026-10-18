// src/components/project/OfflineUnavailable.tsx
// What a project / book / course screen shows when it has nothing to display and there is no connection, instead of a
// "Loading…" that never ends. If the project IS saved on this device it offers to open that copy; if not, it says so
// plainly and points at the Library, where everything downloaded lives. Never a dead end: there is always a way out.
import { router, type Href } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useOfflineEntries, useOpenOfflineProject } from "@/hooks/useOfflineProjects";
import { useSmartBack } from "@/hooks/useSmartBack";

interface Props {
  /** The project this screen was trying to show — lets us find its saved copy. */
  projectId?: string;
  /** Inside a scrolling page (no full-screen centring or safe-area padding). */
  inline?: boolean;
}

export function OfflineUnavailable({ projectId, inline = false }: Props) {
  const insets = useSafeAreaInsets();
  const back = useSmartBack();
  const entries = useOfflineEntries();
  const openSaved = useOpenOfflineProject();
  const saved = projectId ? entries.data?.find((e) => e.projectId === projectId) : undefined;

  return (
    <View
      className={inline ? "items-center gap-3 px-2 py-12" : "flex-1 items-center justify-center gap-3 bg-canvas px-6"}
      style={inline ? undefined : { paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Icon as={WifiOff} size={28} className="text-ink-muted" />
      <Text className="text-center text-base text-ink">
        {saved ? "You're offline, but this is saved on your device." : "You're offline, and this isn't saved on your device."}
      </Text>
      <Text className="max-w-xs text-center text-sm text-ink-muted">
        {saved ? "Open your saved copy to keep going." : "Connect to the internet to open it. Everything you've downloaded is in your Library."}
      </Text>
      <View className="mt-2 w-full max-w-xs gap-2">
        {saved ? <Button onPress={() => void openSaved(saved)}>Open saved copy</Button> : null}
        <Button variant={saved ? "secondary" : "primary"} onPress={() => router.push("/library" as Href)}>
          Open Library
        </Button>
        {inline ? null : (
          <Button variant="ghost" onPress={back}>
            Back
          </Button>
        )}
      </View>
    </View>
  );
}
