// src/components/project/SupportPitchSheet.tsx
import { useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Text } from "@/components/ui/Text";
import { useSupportPitch } from "@/hooks/useProjectTypeDetails";
import { useTheme } from "@/theme/ThemeProvider";

interface SupportPitchSheetProps {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onSupported: () => void;
}

export function SupportPitchSheet({ projectId, projectTitle, onClose, onSupported }: SupportPitchSheetProps) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supportPitch = useSupportPitch(projectId);

  async function handleSubmit() {
    setError(null);
    const amountUsd = parseFloat(amount);
    if (!amount.trim() || Number.isNaN(amountUsd) || amountUsd <= 0) {
      setError("Enter an amount above $0.");
      return;
    }
    try {
      await supportPitch.mutateAsync({ amountUsd, message: message.trim() || undefined });
      onSupported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process your support.");
    }
  }

  const input = "rounded-xl border border-border bg-canvas px-4 py-3 text-ink";

  return (
    <SheetFrame title="Support this idea" subtitle={projectTitle} onClose={onClose} avoidKeyboard zIndex={55}>
      <Text className="mb-1.5 text-sm font-medium text-ink-muted">Amount (USD)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="25"
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        autoFocus
        className={`${input} mb-3`}
        style={{ fontFamily: "Inter_400Regular" }}
      />

      <Text className="mb-1.5 text-sm font-medium text-ink-muted">Message (optional)</Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        multiline
        textAlignVertical="top"
        placeholder="Good luck with this!"
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        className={`${input} mb-1`}
        style={{ fontFamily: "Inter_400Regular", minHeight: 64 }}
      />
      <Text className="mb-4 text-xs text-ink-muted">
        This is support, not an investment — no equity, no return, no guarantee. You'll join the creator's update group once you back this.
      </Text>

      {error ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-danger">
          {error}
        </Text>
      ) : null}

      <View className="pb-2">
        <Button onPress={() => void handleSubmit()} loading={supportPitch.isPending}>
          {supportPitch.isPending ? "Sending support…" : "Support"}
        </Button>
      </View>
    </SheetFrame>
  );
}
