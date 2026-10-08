// src/components/messages/MessagePreviewLine.tsx
// One-line summary of a message with WhatsApp's little leading glyph: 🎤 Voice message / 0:12,
// 🖼 Photo / 3 photos / the caption, 📄 file name. Plain text messages render as plain text.
// Use this anywhere a message is quoted or previewed (reply quotes, chat list, hidden messages…).
import { FileText, Image as ImageIcon, Mic } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { messagePreview } from "@/lib/chatMedia";

interface MessagePreviewLineProps {
  content: string;
  /** "list" shows a voice message's duration (like WhatsApp's chat list); "quote" shows its name. */
  variant?: "list" | "quote";
  className?: string;
  iconClassName?: string;
  numberOfLines?: number;
}

export function MessagePreviewLine({ content, variant = "quote", className = "", iconClassName = "text-ink-muted", numberOfLines = 1 }: MessagePreviewLineProps) {
  const p = messagePreview(content);
  const Glyph = p.icon === "mic" ? Mic : p.icon === "image" ? ImageIcon : p.icon === "file" ? FileText : null;
  const text = variant === "list" && p.icon === "mic" && p.meta ? p.meta : p.label;

  if (!Glyph) {
    return (
      <Text numberOfLines={numberOfLines} className={className}>
        {text}
      </Text>
    );
  }
  return (
    <View className="min-w-0 flex-row items-center gap-1">
      <Icon as={Glyph} size={variant === "list" ? 14 : 13} className={iconClassName} />
      <Text numberOfLines={numberOfLines} className={`min-w-0 shrink ${className}`}>
        {text}
      </Text>
    </View>
  );
}
