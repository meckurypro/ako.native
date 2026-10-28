// src/components/project/GuestPassSheet.tsx
// Creator-side Guest Pass manager: make a link anyone can open for 6 hours, no account needed, even for a private
// project. Mirrors the web sheet. Passes are minted and revoked server-side; the list only shows live ones.
import * as Clipboard from "expo-clipboard";
import { Check, Clock, Copy, Eye, KeyRound, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useCreateGuestPass, useGuestPasses, useRevokeGuestPass, type GuestPassRow } from "@/hooks/useGuestPass";
import { GUEST_PASS_HOURS, getGuestPassUrl } from "@/lib/guestPass";
import { friendlyError } from "@/lib/friendlyError";

function PassRow({ row, fresh, revoking, onRevoke }: { row: GuestPassRow; fresh: boolean; revoking: boolean; onRevoke: () => void }) {
  const toast = useToast();
  const remaining = useCountdown(row.expires_at);
  const [copied, setCopied] = useState(false);
  const url = getGuestPassUrl(row.token);
  const live = remaining === null || remaining > 0;

  async function copy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Pass link copied.", { variant: "success" });
  }

  async function share() {
    try {
      await Share.share({ message: `Open this on Akọ — no account needed.\n${url}`, url });
    } catch {
      // Dismissed — nothing to do.
    }
  }

  return (
    <View className={`rounded-2xl border bg-canvas px-3.5 py-3 ${fresh ? "border-accent" : "border-border"}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Clock} size={14} className={live ? "text-accent" : "text-ink-muted"} />
          <Text className="text-sm font-medium text-ink">{live ? (remaining === null ? "…" : `${formatCountdown(remaining)} left`) : "Expired"}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon as={Eye} size={13} className="text-ink-muted" />
          <Text className="text-xs text-ink-muted">
            {row.open_count} {row.open_count === 1 ? "open" : "opens"}
          </Text>
        </View>
      </View>
      <Text selectable className="mt-2 text-xs text-ink-muted">
        {url}
      </Text>
      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          onPress={() => void copy()}
          disabled={!live}
          className={`flex-row items-center gap-1.5 rounded-full bg-cta px-3.5 py-1.5 ${live ? "" : "opacity-50"}`}
        >
          <Icon as={copied ? Check : Copy} size={14} className="text-white" />
          <Text className="text-sm font-medium text-white">{copied ? "Copied" : "Copy link"}</Text>
        </Pressable>
        <Pressable
          onPress={() => void share()}
          disabled={!live}
          className={`flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 ${live ? "" : "opacity-50"}`}
        >
          <Icon as={Share2} size={14} className="text-accent" />
          <Text className="text-sm font-medium text-accent">Share</Text>
        </Pressable>
        <Pressable onPress={onRevoke} disabled={revoking} className={`ml-auto ${revoking ? "opacity-50" : ""}`}>
          <Text className="text-sm font-medium text-danger">Revoke</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function GuestPassSheet({
  projectId,
  projectTitle,
  isPrivate,
  isPaid,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  isPrivate: boolean;
  isPaid: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: passes, isLoading } = useGuestPasses(projectId);
  const create = useCreateGuestPass(projectId);
  const revoke = useRevokeGuestPass(projectId);
  const [freshId, setFreshId] = useState<string | null>(null);

  async function handleCreate() {
    try {
      const row = await create.mutateAsync();
      setFreshId(row.pass_id);
      await Clipboard.setStringAsync(getGuestPassUrl(row.token)).catch(() => {});
      toast("Pass link created and copied.", { variant: "success" });
    } catch (e) {
      toast(friendlyError(e, "Couldn't create the pass."), { variant: "error" });
    }
  }

  async function handleRevoke(passId: string) {
    try {
      await revoke.mutateAsync(passId);
      toast("Pass revoked. That link no longer works.", { variant: "success" });
    } catch (e) {
      toast(friendlyError(e, "Couldn't revoke the pass."), { variant: "error" });
    }
  }

  return (
    <SheetFrame title="Guest Pass" subtitle={projectTitle} onClose={onClose} heightRatio={0.8} zIndex={55} scrim="ink">
      <View className="flex-row items-start gap-2">
        <Icon as={KeyRound} size={16} className="mt-0.5 text-accent" />
        <Text className="flex-1 text-sm text-ink-muted">
          Make a link that anyone can open for {GUEST_PASS_HOURS} hours — no account needed.
          {isPrivate ? " It works even though this project is private." : ""} A countdown shows them when it ends.
        </Text>
      </View>
      {isPaid ? (
        <Text className="mt-3 rounded-xl border border-border bg-canvas px-3 py-2 text-xs text-ink-muted">
          This project is paid. Anyone with the link can view its content (and download any files) for free while the pass is live.
        </Text>
      ) : null}

      <View className="mt-4">
        <Button loading={create.isPending} onPress={() => void handleCreate()}>
          Create a {GUEST_PASS_HOURS}-hour pass link
        </Button>
      </View>

      <View className="mt-5 gap-2.5">
        {isLoading ? (
          <Text className="py-4 text-center text-sm text-ink-muted">Loading…</Text>
        ) : !passes?.length ? (
          <Text className="py-4 text-center text-sm text-ink-muted">No live passes yet.</Text>
        ) : (
          <>
            <Text className="text-xs font-medium uppercase text-ink-muted">Live passes</Text>
            {passes.map((row) => (
              <PassRow
                key={row.pass_id}
                row={row}
                fresh={row.pass_id === freshId}
                revoking={revoke.isPending && revoke.variables === row.pass_id}
                onRevoke={() => void handleRevoke(row.pass_id)}
              />
            ))}
          </>
        )}
      </View>
    </SheetFrame>
  );
}
