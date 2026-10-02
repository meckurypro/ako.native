// src/components/account/AddAccountModal.tsx
// Lightweight "sign into another account" dialog (email + password). The
// switcher itself uses the full login screen in add mode; this modal is kept
// for callers that want to stay in place.
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAddAccount } from "@/hooks/useAccountSwitcher";
import { useTheme } from "@/theme/ThemeProvider";

interface AddAccountModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export function AddAccountModal({ onClose, onAdded }: AddAccountModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addAccount = useAddAccount();
  const passwordRef = useRef<TextInput>(null);
  const { colors } = useTheme();

  async function handleSubmit() {
    if (addAccount.isPending || !email.trim() || !password) return;
    setError(null);
    try {
      await addAccount.mutateAsync({ email: email.trim(), password });
      onAdded();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't sign into that account.");
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Add account">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-display text-lg text-overlay-ink">Add account</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
          <Icon as={X} size={20} className="text-overlay-ink-muted" />
        </Pressable>
      </View>

      <Text className="mb-4 text-sm text-overlay-ink-muted">
        Sign into another personal account. Your current account stays saved on this device — switch back to it anytime
        from the same menu.
      </Text>

      {/* Inputs sit on the dark overlay panel, so they carry their own surface
          fill (as on web) instead of the transparent underline FormField. */}
      <View className="mb-3 gap-3">
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.inkMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
          accessibilityLabel="Email"
          className="w-full rounded-xl bg-surface px-4 py-3 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.inkMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          accessibilityLabel="Password"
          className="w-full rounded-xl bg-surface px-4 py-3 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {error ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-overlay-danger">
          {error}
        </Text>
      ) : null}

      <Button onPress={handleSubmit} loading={addAccount.isPending} disabled={!email.trim() || !password}>
        Add account
      </Button>
    </Modal>
  );
}
