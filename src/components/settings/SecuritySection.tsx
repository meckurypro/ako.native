// src/components/settings/SecuritySection.tsx
// Account & security: change password (re-authenticates with the current one first) for accounts that have a
// password; "Reset password" (emailed link) for accounts that signed in another way, and for anyone who forgot theirs.
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PasswordField } from "@/components/ui/PasswordField";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useChangePassword, useSendPasswordReset } from "@/hooks/usePrivacy";
import { hasPasswordLogin } from "@/lib/authMethods";
import { haptics } from "@/lib/haptics";

const MIN_PASSWORD = 8;

export function SecuritySection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const { user } = useAuth();
  const sendReset = useSendPasswordReset();
  const canChangePassword = hasPasswordLogin(user);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleChangePassword() {
    setPasswordSuccess(false);
    setLocalError(null);
    changePassword.reset();

    if (!currentPassword) return setLocalError("Enter your current password.");
    if (newPassword.length < MIN_PASSWORD) return setLocalError(`Use at least ${MIN_PASSWORD} characters for your new password.`);

    if (newPassword !== confirmNewPassword) return setLocalError("Passwords don't match.");

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      haptics.success();
    } catch {
      /* surfaced through changePassword.error below */
    }
  }

  // A validation sentence we wrote, or the raw failure — ErrorBanner sanitises and classifies either.
  const error: unknown = localError ?? (changePassword.isError ? changePassword.error : null);

  return (
    <SettingsSection icon={<Icon as={KeyRound} size={18} className="text-ink-muted" />} title="Account & security" open={open} onToggle={onToggle}>
      <View className="mt-3">
        {canChangePassword ? (
          <>
            <PasswordField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} autoComplete="current-password" textContentType="password" />
            <PasswordField label="New password" value={newPassword} onChangeText={setNewPassword} autoComplete="new-password" textContentType="newPassword" />
            <PasswordField label="Confirm new password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} autoComplete="new-password" textContentType="newPassword" />
            <ErrorBanner
              error={error}
              fallback="Couldn't change your password. Please try again."
              onRetry={changePassword.isError && !localError ? handleChangePassword : undefined}
              onDismiss={() => {
                setLocalError(null);
                changePassword.reset();
              }}
            />
            {passwordSuccess ? <Text className="mb-4 text-sm text-accent">Password updated.</Text> : null}
            <Button onPress={handleChangePassword} loading={changePassword.isPending}>
              Update password
            </Button>
          </>
        ) : (
          <Text className="text-sm text-ink-muted">You signed in without a password. Reset your password to set one — we'll email you a link.</Text>
        )}

        <View className="mt-5 border-t border-border pt-4">
          {canChangePassword ? (
            <Text className="mb-3 text-sm text-ink-muted">Forgot your current password? Reset it with a link sent to your email.</Text>
          ) : null}
          <ErrorBanner
            error={sendReset.isError ? sendReset.error : null}
            fallback="Couldn't send the reset link. Please try again."
            onDismiss={() => sendReset.reset()}
          />
          {sendReset.isSuccess ? <Text className="mb-3 text-sm text-accent">Reset link sent to {sendReset.data}. Check your inbox.</Text> : null}
          <Button variant={canChangePassword ? "secondary" : "primary"} onPress={() => sendReset.mutate()} loading={sendReset.isPending}>
            Reset password
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}
