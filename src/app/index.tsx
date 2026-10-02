// src/app/index.tsx
// Temporary: design-system gallery for visually checking every primitive on a
// device (light / dark / page mode). Replaced by the real feed in step 6.
import { Bell, Link2, Trash2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AkoMark,
  AuthPattern,
  Avatar,
  Button,
  ConfirmDialog,
  DropdownMenu,
  FormField,
  Icon,
  LikeHeart,
  MessageStatusTicks,
  OtpInput,
  PasswordField,
  PresenceDot,
  PrivacyToggle,
  SettingsSection,
  Text,
  TierBadge,
  Toggle,
  VerifiedBadge,
  VoiceWaveform,
  Wallpaper,
  Wordmark,
  useToast,
} from "@/components/ui";
import { useTheme, type ThemeSetting } from "@/theme/ThemeProvider";

const THEMES: ThemeSetting[] = ["light", "dark", "system"];
const LEVELS = Array.from({ length: 40 }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.7)));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-8">
      <Text className="mb-3 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">{title}</Text>
      {children}
    </View>
  );
}

export default function Gallery() {
  const insets = useSafeAreaInsets();
  const { theme, setTheme, pageMode, setPageMode } = useTheme();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [priv, setPriv] = useState(false);
  const [toggle, setToggle] = useState(true);
  const [open, setOpen] = useState<string | null>("a");
  const menuAnchor = useRef<View>(null);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <Wordmark />
      <Text className="mb-6 mt-2 text-center text-ink-muted">Design system gallery</Text>

      <Section title="Theme">
        <View className="flex-row flex-wrap gap-2">
          {THEMES.map((o) => (
            <Pressable
              key={o}
              onPress={() => setTheme(o)}
              className={`rounded-full px-4 py-2 ${theme === o ? "bg-accent" : "bg-accent-soft"}`}
            >
              <Text className={theme === o ? "font-medium text-canvas" : "font-medium text-ink"}>{o}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setPageMode(!pageMode)}
            className="rounded-full border border-border px-4 py-2"
          >
            <Text className="font-medium text-ink">Page mode: {pageMode ? "on" : "off"}</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Typography">
        <Text className="font-display text-3xl font-bold text-ink">Playfair Display</Text>
        <Text className="font-display text-xl font-semibold italic text-post-header">Italic heading</Text>
        <Text className="mt-2 text-ink">
          Inter body — <Text className="font-bold">bold span inherits</Text> the family.
        </Text>
        <Text className="font-simple text-ink-muted">Roboto, the plain sans.</Text>
      </Section>

      <Section title="Buttons">
        <View className="gap-3">
          <Button onPress={() => toast("Saved.", { variant: "success" })}>Primary</Button>
          <Button variant="secondary" onPress={() => toast("Something failed.", { variant: "error" })}>
            Secondary
          </Button>
          <Button variant="ghost" onPress={() => toast("Just so you know.")}>
            Ghost
          </Button>
          <Button loading>Loading</Button>
          <View className="flex-row gap-2">
            <Button size="sm">Follow</Button>
            <Button size="sm" variant="secondary">
              Following
            </Button>
          </View>
        </View>
      </Section>

      <Section title="Identity">
        <View className="flex-row items-center gap-3">
          <Avatar name="Ada Obi" size="sm" />
          <Avatar name="Chidi Eze" />
          <Avatar name="Ngozi Bello" size="xl" />
          <Avatar name="Tunde A" size="lg" />
        </View>
        <View className="mt-4 flex-row items-center gap-3">
          <TierBadge tier="contributor" />
          <TierBadge tier="host" />
          <VerifiedBadge />
          <VerifiedBadge label />
          <PresenceDot lastSeenAt={new Date().toISOString()} />
          <AkoMark size={20} />
        </View>
      </Section>

      <Section title="Form fields">
        <FormField label="Username" placeholder="ada" autoCapitalize="none" />
        <FormField label="Email" placeholder="you@example.com" error="That email looks off." keyboardType="email-address" />
        <PasswordField label="Password" placeholder="••••••••" />
        <OtpInput onComplete={(c) => toast(`Code ${c}`)} />
      </Section>

      <Section title="Controls">
        <View className="mb-4 flex-row items-center gap-3">
          <Toggle checked={toggle} onChange={setToggle} accessibilityLabel="Demo toggle" />
          <Text className="text-ink">Toggle</Text>
        </View>
        <PrivacyToggle checked={priv} onChange={setPriv} />
        <View className="gap-3">
          {["a", "b"].map((k) => (
            <SettingsSection
              key={k}
              icon={<Icon as={Bell} size={18} className="text-ink-muted" />}
              title={`Settings section ${k.toUpperCase()}`}
              summary="Summary"
              open={open === k}
              onToggle={() => setOpen(open === k ? null : k)}
            >
              <Text className="py-2 text-ink-muted">Collapsible content goes here.</Text>
            </SettingsSection>
          ))}
        </View>
      </Section>

      <Section title="Feedback & overlays">
        <View className="flex-row flex-wrap items-center gap-3">
          <Button size="sm" onPress={() => setConfirm(true)}>
            Confirm dialog
          </Button>
          <View ref={menuAnchor} collapsable={false}>
            <Button size="sm" variant="secondary" onPress={() => setMenu(true)}>
              Dropdown
            </Button>
          </View>
        </View>
      </Section>

      <Section title="Chat & engagement">
        <View className="flex-row items-center gap-5">
          <Pressable onPress={() => setLiked((l) => !l)} hitSlop={10}>
            <LikeHeart active={liked} size={26} className="text-danger" />
          </Pressable>
          <MessageStatusTicks deliveredAt={null} readAt={null} variant="list" />
          <MessageStatusTicks deliveredAt="x" readAt={null} variant="list" />
          <MessageStatusTicks deliveredAt="x" readAt="x" variant="list" />
        </View>
        <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-bubble-mine p-3">
          <VoiceWaveform levels={LEVELS} progress={0.4} filledColor="bg-white" mutedColor="bg-white/40" onSeek={() => {}} />
        </View>
      </Section>

      <Section title="Backgrounds">
        <View className="h-40 overflow-hidden rounded-2xl border border-border bg-canvas">
          <Wallpaper />
          <View className="flex-1 items-center justify-center">
            <Text className="text-ink">Chat wallpaper</Text>
          </View>
        </View>
        <View className="mt-3 h-40 overflow-hidden rounded-2xl border border-border bg-canvas">
          <AuthPattern />
          <View className="flex-1 items-center justify-center">
            <Text className="text-ink">Auth pattern</Text>
          </View>
        </View>
      </Section>

      {confirm && (
        <ConfirmDialog
          title="Delete this chat?"
          description="This can't be undone and removes it for you only."
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirm(false);
            toast("Deleted.", { variant: "success" });
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {menu && (
        <DropdownMenu
          anchorRef={menuAnchor}
          onClose={() => setMenu(false)}
          items={[
            { key: "link", label: "Copy link", icon: <Icon as={Link2} size={22} className="text-overlay-ink" />, onSelect: () => toast("Link copied") },
            "divider",
            { key: "del", label: "Delete", variant: "danger", icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />, onSelect: () => setConfirm(true) },
          ]}
        />
      )}
    </ScrollView>
  );
}
