// src/components/customPage/InquiryDialog.tsx
// The visitor-facing "Send a message" form. Works signed out (the RPC is open to anon and rate-limited server-side).
// The web form carries a hidden honeypot field for bots; a native app has no such visitors, so the field is sent empty.
import { CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { submitCustomPageInquiry } from "@/hooks/useCustomPages";
import { friendlyError } from "@/lib/friendlyError";
import { useTheme } from "@/theme/ThemeProvider";

const FIELD = "w-full rounded-xl bg-overlay-surface-raised px-4 py-3 text-sm text-overlay-ink";

export function InquiryDialog({ pageId, pageName, onClose }: { pageId: string; pageName: string; onClose: () => void }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [contact, setContact] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ready = name.trim().length > 0 && contact.trim().length > 0 && message.trim().length > 0;

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await submitCustomPageInquiry({ pageId, name: name.trim(), contact: contact.trim(), subject: subject.trim(), message: message.trim(), honeypot: "" });
      setSent(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't send your message. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const input = { fontFamily: "Inter_400Regular" } as const;

  return (
    <Modal onClose={onClose} title={sent ? "Message sent" : `Message ${pageName}`} maxWidth={448}>
      {sent ? (
        <View className="items-center py-2">
          <Icon as={CheckCircle2} size={40} className="mb-3 text-overlay-accent" />
          <Text className="mb-6 text-center text-sm text-overlay-ink-muted">
            Thank you. Your message has been delivered and they'll get back to you using the contact you gave.
          </Text>
          <Button onPress={onClose}>Done</Button>
        </View>
      ) : (
        <View className="gap-3">
          <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.inkMuted} maxLength={80} autoComplete="name" accessibilityLabel="Your name" className={FIELD} style={input} />
          <TextInput
            value={contact}
            onChangeText={setContact}
            placeholder="Email or phone number"
            placeholderTextColor={colors.inkMuted}
            maxLength={120}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email or phone number"
            className={FIELD}
            style={input}
          />
          <TextInput value={subject} onChangeText={setSubject} placeholder="Subject (optional)" placeholderTextColor={colors.inkMuted} maxLength={120} accessibilityLabel="Subject" className={FIELD} style={input} />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Your message"
            placeholderTextColor={colors.inkMuted}
            maxLength={2000}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Your message"
            className={FIELD}
            style={[input, { minHeight: 110 }]}
          />
          {error ? (
            <Text accessibilityRole="alert" className="text-sm text-overlay-danger">
              {error}
            </Text>
          ) : null}
          <Button onPress={() => void submit()} loading={busy} disabled={!ready}>
            Send message
          </Button>
        </View>
      )}
    </Modal>
  );
}
