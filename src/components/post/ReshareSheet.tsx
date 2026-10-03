// src/components/post/ReshareSheet.tsx
// Reshare = "Repost" (plain, one tap) or "Quote" (add your own caption, shown
// above the embedded original). Step 1 is a small action sheet; step 2 is the
// caption composer, docked above the keyboard.
import { PenSquare, Repeat2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetRow } from "@/components/ui/SheetParts";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useCreateReshare } from "@/hooks/usePosts";
import type { RepostSource } from "@/types/database";
import { useTheme } from "@/theme/ThemeProvider";
import { RepostEmbed } from "./RepostEmbed";

interface ReshareSheetProps {
  postId: string;
  source: RepostSource;
  onClose: () => void;
}

const QUOTE_LIMIT = 1000;

export function ReshareSheet({ postId, source, onClose }: ReshareSheetProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<"choose" | "quote">("choose");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createReshare = useCreateReshare();
  const toast = useToast();

  // In the quote step, Back returns to the choice rather than closing everything.
  useBackDismiss(() => setMode("choose"), mode === "quote");

  async function handleRepost() {
    setError(null);
    try {
      await createReshare.mutateAsync({ originalPostId: postId });
      onClose();
      toast("Reposted.", { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't repost this.");
    }
  }

  async function handleQuoteSubmit() {
    if (!caption.trim()) return;
    setError(null);
    try {
      await createReshare.mutateAsync({ originalPostId: postId, caption });
      onClose();
      toast("Posted.", { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post this.");
    }
  }

  if (mode === "choose") {
    return (
      <Sheet onClose={onClose} accessibilityLabel="Reshare">
        <SheetRow
          label={createReshare.isPending ? "Reposting…" : "Repost"}
          icon={<Icon as={Repeat2} size={18} className="text-accent" />}
          disabled={createReshare.isPending}
          closeFirst={false}
          onPress={handleRepost}
        />
        <SheetRow
          label="Quote"
          icon={<Icon as={PenSquare} size={18} className="text-accent" />}
          closeFirst={false}
          onPress={() => setMode("quote")}
        />
        {error ? <Text className="px-4 pb-2 text-sm text-danger">{error}</Text> : null}
        <SheetCancel />
      </Sheet>
    );
  }

  return (
    <Modal onClose={onClose} bare align="bottom" maxWidth={448} ariaLabel="Quote post">
      <View className="overflow-hidden rounded-2xl border-t-4 border-accent bg-canvas">
        <View className="p-5">
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={QUOTE_LIMIT}
            multiline
            autoFocus
            placeholder="Add a comment…"
            placeholderTextColor={`${colors.inkMuted}99`}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            textAlignVertical="top"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-ink"
            style={{ fontFamily: "Inter_400Regular", minHeight: 112 }}
          />

          {/* Preview of the original, exactly as it'll appear embedded once posted */}
          <RepostEmbed source={source} />

          {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}

          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs text-ink-muted">
              {caption.length}/{QUOTE_LIMIT}
            </Text>
            <Pressable
              onPress={handleQuoteSubmit}
              disabled={createReshare.isPending || !caption.trim()}
              accessibilityRole="button"
              className={`rounded-full bg-accent px-5 py-2 ${createReshare.isPending || !caption.trim() ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-medium text-canvas">{createReshare.isPending ? "Posting…" : "Quote"}</Text>
            </Pressable>
          </View>

          <View className="mt-3 items-center">
            <Pressable onPress={onClose} accessibilityRole="button" className="rounded-full border border-border px-6 py-2 active:bg-surface">
              <Text className="text-sm font-medium text-ink-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
