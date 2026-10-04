// src/components/profile/ShareProfileSheet.tsx
// The "···" sheet on someone else's profile: send their profile to a recent
// chat, share it outside the app, and manage the relationship (nickname,
// report, mute, block, remove follower, QR). Three modes: menu · nickname · report.
import { Ban, Bell, BellOff, Check, Flag, FileWarning, Link2, Mail, MessageSquare, PenSquare, QrCode, Search, Share2, UserMinus, X } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Share, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { FacebookGlyph, WhatsAppGlyph, XGlyph } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Sheet, useSheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { runAfterDismiss, useBackDismiss } from "@/hooks/useBackDismiss";
import { useContactNickname, useSetContactNickname } from "@/hooks/useContactNicknames";
import { useConversations, useStartConversation } from "@/hooks/useMessaging";
import { useReportReasons, useSubmitReport } from "@/hooks/useReports";
import { APP_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";

interface ShareProfileSheetProps {
  profile: { id: string; username: string; display_name: string; avatar_url: string | null };
  isFollowedByUser: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  onToggleBlock: () => void;
  onToggleMute: () => void;
  onRemoveFollower: () => void;
  onOpenQR: () => void;
  onReportContent: () => void;
  onClose: () => void;
}

type Mode = "menu" | "nickname" | "report";

function ExternalTarget({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="w-16 shrink-0 items-center gap-1">
      {children}
      <Text numberOfLines={1} className="w-full text-center text-[11px] text-ink-muted">
        {label}
      </Text>
    </Pressable>
  );
}

function Round({ className, children }: { className: string; children: ReactNode }) {
  return <View className={`h-12 w-12 shrink-0 items-center justify-center rounded-full ${className}`}>{children}</View>;
}

function Body(props: ShareProfileSheetProps & { mode: Mode; setMode: (m: Mode) => void }) {
  const { profile, isFollowedByUser, isBlocked, isMuted, onToggleBlock, onToggleMute, onRemoveFollower, onOpenQR, onReportContent, mode, setMode } = props;
  const { close } = useSheet();
  const toast = useToast();
  const { colors } = useTheme();

  const profileUrl = `${APP_URL}/profile/${profile.username}`;
  const shareText = `Check out ${profile.display_name} on Akọ`;

  const { data: conversations } = useConversations();
  const startConversation = useStartConversation();
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const recentContacts = useMemo(() => {
    const list = (conversations ?? [])
      .filter((c) => !c.is_group && c.other_participant?.id && c.other_participant.id !== profile.id)
      .map((c) => c.other_participant);
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((p) => p.display_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 12);
  }, [conversations, query, profile.id]);

  async function handleSendTo(userId: string) {
    if (sendingId) return;
    setSendingId(userId);
    try {
      const conversationId = await startConversation.mutateAsync(userId);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: (await supabase.auth.getUser()).data.user!.id,
        content: profileUrl,
      });
      if (error) throw error;
      setSentIds((prev) => new Set(prev).add(userId));
    } catch {
      toast("Couldn't send — try again.", { variant: "error" });
    } finally {
      setSendingId(null);
    }
  }

  async function handleCopyLink() {
    await Clipboard.setStringAsync(profileUrl);
    toast("Link copied.", { variant: "success" });
  }

  async function handleMore() {
    try {
      await Share.share({ message: profileUrl, url: profileUrl, title: profile.display_name });
    } catch {
      /* dismissed */
    }
  }

  const openExternal = (url: string) => void Linking.openURL(url).catch(() => toast("Couldn't open that app.", { variant: "error" }));

  // nickname
  const { data: nickname } = useContactNickname(profile.id);
  const setNickname = useSetContactNickname(profile.id);
  const [nicknameInput, setNicknameInput] = useState(nickname ?? "");

  async function handleSaveNickname() {
    try {
      await setNickname.mutateAsync(nicknameInput);
      toast(nicknameInput.trim() ? "Nickname saved." : "Nickname removed.", { variant: "success" });
      setMode("menu");
    } catch {
      toast("Couldn't save that.", { variant: "error" });
    }
  }

  // report
  const { data: reasons } = useReportReasons();
  const submitReport = useSubmitReport();
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  async function handleSubmitReport() {
    if (!selectedReasonId) return;
    try {
      await submitReport.mutateAsync({ targetType: "profile", targetId: profile.id, reasonId: selectedReasonId, details: reportDetails });
      setReportSubmitted(true);
    } catch {
      toast("Couldn't submit the report — try again.", { variant: "error" });
    }
  }

  const inputClass = "rounded-xl border border-border bg-canvas px-4 py-3 text-ink";

  if (mode === "nickname") {
    return (
      <View className="p-5">
        <Text className="mb-1 text-sm font-medium text-ink">Customise name</Text>
        <Text className="mb-4 text-xs text-ink-muted">Only you will see this name for {profile.display_name}.</Text>
        <TextInput
          autoFocus
          value={nicknameInput}
          onChangeText={setNicknameInput}
          placeholder={profile.display_name}
          placeholderTextColor={`${colors.inkMuted}99`}
          selectionColor={colors.accent}
          maxLength={60}
          className={inputClass}
          style={{ fontFamily: "Inter_400Regular" }}
        />
        <View className="mt-4 flex-row gap-2">
          <Pressable onPress={() => setMode("menu")} accessibilityRole="button" className="flex-1 items-center rounded-lg border border-border py-2.5">
            <Text className="text-sm text-ink-muted">Cancel</Text>
          </Pressable>
          <View className="flex-1">
            <Button onPress={() => void handleSaveNickname()} loading={setNickname.isPending} className="py-2.5">
              Save
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (mode === "report") {
    return reportSubmitted ? (
      <View className="items-center p-6">
        <Icon as={Flag} size={28} className="mb-3 text-accent" />
        <Text className="text-sm font-medium text-ink">Report submitted</Text>
        <Text className="mb-5 mt-1 text-center text-xs text-ink-muted">Thanks for letting us know. Our team will review this account.</Text>
        <Button onPress={close}>Done</Button>
      </View>
    ) : (
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerClassName="p-5">
        <Text className="mb-1 text-sm font-medium text-ink">Report {profile.display_name}</Text>
        <Text className="mb-4 text-xs text-ink-muted">What's wrong with this account?</Text>
        <View className="mb-3 gap-1">
          {(reasons ?? []).map((reason) => (
            <Pressable
              key={reason.id}
              onPress={() => setSelectedReasonId(reason.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedReasonId === reason.id }}
              className={`rounded-lg border px-3 py-2.5 ${selectedReasonId === reason.id ? "border-accent bg-accent-soft" : "border-border"}`}
            >
              <Text className={`text-sm ${selectedReasonId === reason.id ? "text-accent" : "text-ink"}`}>{reason.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={reportDetails}
          onChangeText={setReportDetails}
          placeholder="Add details (optional)"
          placeholderTextColor={`${colors.inkMuted}99`}
          selectionColor={colors.accent}
          multiline
          maxLength={500}
          textAlignVertical="top"
          className="rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular", minHeight: 76 }}
        />
        <View className="mt-4 flex-row gap-2">
          <Pressable onPress={() => setMode("menu")} accessibilityRole="button" className="flex-1 items-center rounded-lg border border-border py-2.5">
            <Text className="text-sm text-ink-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSubmitReport()}
            disabled={!selectedReasonId || submitReport.isPending}
            accessibilityRole="button"
            className={`flex-1 items-center rounded-lg bg-danger py-2.5 ${!selectedReasonId || submitReport.isPending ? "opacity-50" : ""}`}
          >
            <Text className="text-sm font-medium text-canvas">{submitReport.isPending ? "Submitting…" : "Submit"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const after = (fn: () => void) => () => runAfterDismiss(close, fn);

  const actions: { key: string; label: string; icon: ReactNode; danger?: boolean; onSelect: () => void }[] = [
    { key: "nickname", label: "Customise name", icon: <Icon as={PenSquare} size={20} className="text-ink" />, onSelect: () => setMode("nickname") },
    { key: "report", label: "Report", icon: <Icon as={Flag} size={20} className="text-ink" />, onSelect: () => setMode("report") },
    { key: "report-content", label: "Report a post/project", icon: <Icon as={FileWarning} size={20} className="text-ink" />, onSelect: after(onReportContent) },
    {
      key: "mute",
      label: isMuted ? "Unmute" : "Mute their updates",
      icon: <Icon as={isMuted ? Bell : BellOff} size={20} className="text-ink" />,
      onSelect: onToggleMute,
    },
    { key: "block", label: isBlocked ? "Unblock" : "Block", icon: <Icon as={Ban} size={20} className={isBlocked ? "text-ink" : "text-danger"} />, danger: !isBlocked, onSelect: onToggleBlock },
    ...(isFollowedByUser
      ? [{ key: "remove-follower", label: "Remove this follower", icon: <Icon as={UserMinus} size={20} className="text-danger" />, danger: true, onSelect: onRemoveFollower }]
      : []),
    { key: "qr", label: "QR code", icon: <Icon as={QrCode} size={20} className="text-ink" />, onSelect: after(onOpenQR) },
  ];

  return (
    <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
        <View className="w-7" />
        <Text className="text-sm font-medium text-ink">Send to</Text>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={20} className="text-ink-muted" />
        </Pressable>
      </View>

      <View className="px-4 pb-3">
        <View className="flex-row items-center gap-2 rounded-full border border-border bg-canvas px-3">
          <Icon as={Search} size={15} className="shrink-0 text-ink-muted" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 py-2 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
      </View>

      {recentContacts.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-4 px-4 pb-4">
          {recentContacts.map((contact) => {
            const sent = sentIds.has(contact.id);
            return (
              <Pressable
                key={contact.id}
                onPress={() => void handleSendTo(contact.id)}
                disabled={sendingId === contact.id}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${contact.display_name}`}
                className="w-16 shrink-0 items-center gap-1"
              >
                <View>
                  <Avatar src={contact.avatar_url} name={contact.display_name} size="lg" />
                  {sent ? (
                    <View className="absolute inset-0 items-center justify-center rounded-full bg-ink/50">
                      <Icon as={Check} size={22} className="text-canvas" />
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} className="w-full text-center text-[11px] text-ink">
                  {contact.display_name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View className="border-t border-border" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-4 px-4 py-4">
        <ExternalTarget label="WhatsApp" onPress={() => openExternal(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${profileUrl}`)}`)}>
          <WhatsAppGlyph />
        </ExternalTarget>
        <ExternalTarget label="Copy link" onPress={() => void handleCopyLink()}>
          <Round className="bg-ink/10">
            <Icon as={Link2} size={20} className="text-ink" />
          </Round>
        </ExternalTarget>
        <ExternalTarget label="SMS" onPress={() => openExternal(`sms:?&body=${encodeURIComponent(`${shareText} ${profileUrl}`)}`)}>
          <Round className="bg-[#2FCC66]">
            <Icon as={MessageSquare} size={20} className="text-white" />
          </Round>
        </ExternalTarget>
        <ExternalTarget
          label="Email"
          onPress={() => openExternal(`mailto:?subject=${encodeURIComponent(profile.display_name)}&body=${encodeURIComponent(`${shareText} ${profileUrl}`)}`)}
        >
          <Round className="bg-ink/70">
            <Icon as={Mail} size={20} className="text-canvas" />
          </Round>
        </ExternalTarget>
        <ExternalTarget label="Facebook" onPress={() => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`)}>
          <FacebookGlyph />
        </ExternalTarget>
        <ExternalTarget
          label="X"
          onPress={() => openExternal(`https://twitter.com/intent/tweet?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(shareText)}`)}
        >
          <XGlyph />
        </ExternalTarget>
        <ExternalTarget label="More" onPress={() => void handleMore()}>
          <Round className="bg-ink/10">
            <Icon as={Share2} size={20} className="text-ink" />
          </Round>
        </ExternalTarget>
      </ScrollView>

      <View className="border-t border-border" />

      <View className="flex-row flex-wrap gap-y-4 px-2 py-4">
        {actions.map((action) => (
          <Pressable key={action.key} onPress={action.onSelect} accessibilityRole="button" className="items-center gap-1.5" style={{ width: "25%" }}>
            <Round className={action.danger ? "bg-danger/10" : "bg-ink/10"}>{action.icon}</Round>
            <Text className={`px-0.5 text-center text-[11px] leading-tight ${action.danger ? "text-danger" : "text-ink"}`}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function ShareProfileSheet(props: ShareProfileSheetProps) {
  const [mode, setMode] = useState<Mode>("menu");
  // In nickname/report, Back returns to the menu instead of closing the sheet.
  useBackDismiss(() => setMode("menu"), mode !== "menu");

  return (
    <Sheet
      onClose={props.onClose}
      dragZone="handle"
      showHandle
      avoidKeyboard={mode !== "menu"}
      maxHeightRatio={0.88}
      accessibilityLabel="Share profile"
    >
      <Body {...props} mode={mode} setMode={setMode} />
    </Sheet>
  );
}
