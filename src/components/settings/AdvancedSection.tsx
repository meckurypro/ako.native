// src/components/settings/AdvancedSection.tsx
// Advanced / danger zone: deactivate the account (soft delete — wallet history is kept).
import { AlertTriangle, SlidersHorizontal } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useSignOut } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useDeactivateAccount } from "@/hooks/usePrivacy";
import { removeSavedAccount } from "@/lib/accountSessions";
import { haptics } from "@/lib/haptics";

export function AdvancedSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const deactivate = useDeactivateAccount();
  const signOut = useSignOut();
  const [confirming, setConfirming] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setDeactivating(true);
    setError(null);
    try {
      await deactivate.mutateAsync();
      if (user) removeSavedAccount(user.id);
      // Signing out drops the session; the auth gate then sends the app back to the login screen.
      await signOut.mutateAsync();
      haptics.success();
      toast("Account deactivated.", { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't deactivate account.");
      setDeactivating(false);
    }
  }

  return (
    <SettingsSection icon={<Icon as={SlidersHorizontal} size={18} className="text-danger" />} title="Advanced" danger open={open} onToggle={onToggle}>
      <View className="mt-3">
        {!confirming ? (
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" className="self-start" hitSlop={8}>
            <Text className="text-sm font-medium text-danger">Deactivate account</Text>
          </Pressable>
        ) : (
          <View className="rounded-xl bg-danger/10 p-4">
            <View className="mb-2 flex-row gap-2">
              <Icon as={AlertTriangle} size={18} className="mt-0.5 text-danger" />
              <Text className="min-w-0 flex-1 text-sm text-ink">
                This signs you out everywhere and hides your profile and posts. Your wallet and transaction history are kept for financial record-keeping — this can't be undone from the app.
              </Text>
            </View>
            {error ? <Text className="mb-2 text-sm text-danger">{error}</Text> : null}
            <View className="mt-3 flex-row gap-2">
              <Pressable onPress={handleDeactivate} disabled={deactivating} accessibilityRole="button" className={`flex-1 items-center rounded-lg bg-danger py-2.5 ${deactivating ? "opacity-50" : ""}`}>
                <Text className="text-sm font-medium text-canvas">{deactivating ? "Deactivating…" : "Confirm deactivation"}</Text>
              </Pressable>
              <Pressable onPress={() => setConfirming(false)} disabled={deactivating} accessibilityRole="button" className="flex-1 items-center rounded-lg border border-border bg-canvas py-2.5">
                <Text className="text-sm text-ink-muted">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}
