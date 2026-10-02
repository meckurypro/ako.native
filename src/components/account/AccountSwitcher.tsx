// src/components/account/AccountSwitcher.tsx
// Switch between personal accounts saved on this device. The web build shows a
// small popover under the username; on a phone the native idiom is a bottom
// sheet, so this is a Sheet — same rows, same actions:
//   • you (ticked)   • other saved accounts   • "Add account" (login in add mode)
// Render conditionally: {open && <AccountSwitcher onClose={…} />}
import { Check, Plus } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Sheet, useSheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetCaption } from "@/components/ui/SheetParts";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useSavedAccounts, useSwitchAccount } from "@/hooks/useAccountSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { haptics } from "@/lib/haptics";

function SwitcherBody() {
  const { close } = useSheet();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const { accounts, refresh: refreshSavedAccounts } = useSavedAccounts();
  const switchAccount = useSwitchAccount();
  const [switchError, setSwitchError] = useState<string | null>(null);

  const others = accounts.filter((a) => a.user_id !== user?.id);

  return (
    <>
      <SheetCaption>Switch account</SheetCaption>

      {/* "You" — always first. The saved list only holds OTHER accounts' tokens;
          the current one is live and read from auth instead. */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Avatar src={me?.avatar_url ?? null} name={me?.display_name ?? me?.username ?? "You"} size="sm" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
          {me?.display_name}
        </Text>
        <Icon as={Check} size={16} className="shrink-0 text-accent" />
      </View>

      {others.map((account) => (
        <Pressable
          key={account.user_id}
          accessibilityRole="button"
          disabled={switchAccount.isPending}
          onPress={() => {
            setSwitchError(null);
            haptics.selection();
            switchAccount.mutate(account, {
              onSuccess: () => runAfterDismiss(close, () => router.replace(`/profile/${account.username}` as Href)),
              onError: (err) => {
                setSwitchError(err instanceof Error ? err.message : "Couldn't switch accounts.");
                refreshSavedAccounts();
              },
            });
          }}
          className={`flex-row items-center gap-3 px-4 py-3 active:bg-border/40 ${switchAccount.isPending ? "opacity-60" : ""}`}
        >
          <Avatar src={account.avatar_url} name={account.display_name} size="sm" />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
            {account.display_name}
          </Text>
        </Pressable>
      ))}

      {switchError ? <Text className="border-t border-border px-4 py-2 text-xs text-danger">{switchError}</Text> : null}

      {/* Full login flow in add mode (snapshots this account before signing into the new one). */}
      <Pressable
        accessibilityRole="button"
        onPress={() => runAfterDismiss(close, () => router.push("/login?add=1" as Href))}
        className="flex-row items-center gap-3 px-4 py-3 active:bg-border/40"
      >
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={Plus} size={15} className="text-accent" />
        </View>
        <Text className="text-sm text-accent">Add account</Text>
      </Pressable>

      <SheetCancel label="Close" />
    </>
  );
}

export function AccountSwitcher({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} accessibilityLabel="Switch account">
      <SwitcherBody />
    </Sheet>
  );
}
