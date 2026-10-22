// src/components/comments/ReplyBar.tsx
import { Hand, HelpCircle, MessageSquarePlus, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { useMyProfile } from "@/hooks/useProfile";
import { useActiveIdentity } from "@/hooks/usePages";
import { useTheme } from "@/theme/ThemeProvider";
import type { Stance } from "@/types/database";

/** The reply stances, in the order they're offered. ("support" is stored; people see "Add".) Class strings are
 *  spelled out in full so Tailwind can see them at build time. */
const CHOICES: { stance: Stance; label: string; ownLabel: string; Icon: LucideIcon; pill: string; text: string }[] = [
  { stance: "support", label: "Add", ownLabel: "Add to your post", Icon: MessageSquarePlus, pill: "bg-accent-soft", text: "text-accent" },
  { stance: "question", label: "Question", ownLabel: "Question", Icon: HelpCircle, pill: "bg-stance-question-a10", text: "text-stance-question" },
  { stance: "pushback", label: "Pushback", ownLabel: "Pushback", Icon: Hand, pill: "bg-pushback-a10", text: "text-pushback" },
];

/**
 * The "say something" row under a post or an opened comment. There is no free-text field: every reply starts by
 * choosing what it is — Add, Question or Pushback — so intent is never lost in a generic "comment". Tapping one
 * opens the composer already set to it (and it can't be switched afterwards). `stances` narrows the choices: a
 * post's own author can only Add to their own post.
 */
export function ReplyBar({
  placeholder,
  stances = ["support", "question", "pushback"],
  onOpen,
}: {
  placeholder: string;
  stances?: Stance[];
  onOpen: (stance: Stance) => void;
}) {
  const { colors } = useTheme();
  const { data: me } = useMyProfile();
  const { data: identity } = useActiveIdentity();
  const page = identity?.mode === "page" ? identity.page : null;
  const name = page?.name ?? me?.display_name ?? "";
  const avatar = page?.avatar_url ?? me?.avatar_url ?? null;
  const choices = CHOICES.filter((c) => stances.includes(c.stance));
  const iconColor: Record<string, string> = { support: colors.accent, question: colors.stanceQuestion, pushback: colors.pushback };

  return (
    <View className="border-b border-border py-3">
      <View className="mb-2.5 flex-row items-center gap-3">
        <Avatar src={avatar} name={name || "You"} size="sm" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] text-ink-muted">
          {placeholder}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {choices.map(({ stance, label, ownLabel, Icon, pill, text }) => (
          <Pressable
            key={stance}
            onPress={() => onOpen(stance)}
            accessibilityRole="button"
            accessibilityLabel={choices.length === 1 ? ownLabel : label}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 active:opacity-70 ${pill}`}
          >
            <Icon size={16} color={iconColor[stance]} />
            <Text className={`text-sm font-medium ${text}`}>{choices.length === 1 ? ownLabel : label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
