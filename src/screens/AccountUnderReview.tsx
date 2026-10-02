// src/screens/AccountUnderReview.tsx
import { Clock3 } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useSignOut } from "@/hooks/useAccountAccess";

export function AccountUnderReview() {
  const signOut = useSignOut();

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <View className="max-w-xs items-center">
        <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={Clock3} size={28} className="text-accent" />
        </View>
        <Text className="mb-2 text-center font-display text-xl text-ink">Your Akọ account is under review</Text>
        <Text className="mb-1 text-center text-sm text-ink-muted">
          We're carefully welcoming people into Akọ during this early period. Your account has been received and is
          currently being reviewed.
        </Text>
        <Text className="mb-8 text-center text-sm text-ink-muted">
          There's nothing else you need to do right now — check back soon, or we'll be in touch.
        </Text>
        <Button variant="ghost" onPress={() => signOut.mutate()} loading={signOut.isPending} className="w-auto px-4">
          Log out
        </Button>
      </View>
    </View>
  );
}
