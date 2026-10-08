// src/components/settings/SecuritySection.tsx
// Account & security: change password (re-authenticates with the current one first).
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useChangePassword } from "@/hooks/usePrivacy";
import { haptics } from "@/lib/haptics";

const MIN_PASSWORD = 8;

export function SecuritySection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleChangePassword() {
    setPasswordSuccess(false);
    setLocalError(null);
    changePassword.reset();

    if (!currentPassword) return setLocalError("Enter your current password.");
    if (newPassword.length < MIN_PASSWORD) return setLocalError(`Use at least ${MIN_PASSWORD} characters for your new password.`);

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      haptics.success();
    } catch {
      /* surfaced through changePassword.error below */
    }
  }

  const error = localError ?? (changePassword.isError ? (changePassword.error instanceof Error ? changePassword.error.message : "Couldn't change your password.") : null);

  return (
    <SettingsSection icon={<Icon as={KeyRound} size={18} className="text-ink-muted" />} title="Account & security" open={open} onToggle={onToggle}>
      <View className="mt-3">
        <PasswordField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} autoComplete="current-password" textContentType="password" />
        <PasswordField label="New password" value={newPassword} onChangeText={setNewPassword} autoComplete="new-password" textContentType="newPassword" />
        {error ? (
          <Text className="mb-4 text-sm text-danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {passwordSuccess ? <Text className="mb-4 text-sm text-accent">Password updated.</Text> : null}
        <Button onPress={handleChangePassword} loading={changePassword.isPending}>
          Update password
        </Button>
      </View>
    </SettingsSection>
  );
}
