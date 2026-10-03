// src/components/post/GiftPicker.tsx
// Send a gift: catalogue → confirm → sent. Opens above other sheets (zIndex 60).
// Gift art ships inside the app (lib/giftAssets); the "sent" step plays a small
// pop + rising-glyph moment.
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { router } from "expo-router";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";
import { useSheet } from "@/components/ui/Sheet";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss, runAfterDismiss } from "@/hooks/useBackDismiss";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useSendGift, useSendMediaGift } from "@/hooks/useGifting";
import { useGiftTypes, useTopGiftTypeIds, useWallet } from "@/hooks/useWallet";
import { giftIconSource } from "@/lib/giftAssets";
import { haptics } from "@/lib/haptics";
import type { GiftType } from "@/types/database";

interface GiftPickerProps {
  recipientId: string;
  recipientName: string;
  recipientAvatar: string | null;
  postId?: string;
  commentId?: string;
  projectId?: string;
  onClose: () => void;
}

type Step = "catalog" | "confirm" | "sent";

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function GiftIcon({ gift, size, glyphClass = "text-2xl" }: { gift: GiftType; size: number; glyphClass?: string }) {
  const source = giftIconSource(gift.icon_url);
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {source ? (
        <Image source={source} contentFit="contain" style={{ width: size, height: size }} />
      ) : (
        <Text className={glyphClass}>🎁</Text>
      )}
    </View>
  );
}

/** Pop-in icon with a second glyph rising and fading above it. */
function SentBurst({ gift }: { gift: GiftType }) {
  const scale = useSharedValue(0.6);
  const rise = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(withTiming(1.18, { duration: 220, easing: Easing.out(Easing.back(1.6)) }), withTiming(1, { duration: 160 }));
    rise.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
  }, [scale, rise]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const riseStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: -44 * rise.value }],
  }));

  return (
    <View className="h-16 w-16 items-center justify-center">
      <Animated.View style={popStyle}>
        <GiftIcon gift={gift} size={64} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute" }, riseStyle]}>
        <Text className="text-2xl">🎁</Text>
      </Animated.View>
    </View>
  );
}

/** Full-screen "insufficient balance" notice that sits above the sheet. Tap anywhere to dismiss. */
function InsufficientNotice({ gift, onDismiss, onOpenWallet }: { gift: GiftType; onDismiss: () => void; onOpenWallet: () => void }) {
  return (
    <Portal zIndex={70}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        className="flex-1 items-center justify-center gap-4 bg-canvas/70 px-10"
      >
        <GiftIcon gift={gift} size={176} glyphClass="text-8xl" />
        <Text className="max-w-xs text-center text-base font-medium text-ink">
          {`Insufficient balance to gift ${article(gift.name)} ${gift.name}. Please fund your `}
          <Text className="text-ink underline" accessibilityRole="link" onPress={onOpenWallet}>
            wallet
          </Text>
          .
        </Text>
      </Pressable>
    </Portal>
  );
}

function Body(props: GiftPickerProps & { step: Step; setStep: (s: Step) => void }) {
  const { recipientId, recipientName, recipientAvatar, postId, commentId, projectId, step, setStep } = props;
  const { close } = useSheet();
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insufficientGift, setInsufficientGift] = useState<GiftType | null>(null);

  const { data: giftTypes, isLoading: loadingGifts } = useGiftTypes();
  const { data: wallet } = useWallet();
  const { data: topGiftTypeIds } = useTopGiftTypeIds(6);
  const sendGift = useSendGift();
  const sendMediaGift = useSendMediaGift();
  const giftingEnabled = useFeatureFlag("gifting_enabled");

  useBackDismiss(() => setInsufficientGift(null), !!insufficientGift);
  useBackDismiss(() => setStep("catalog"), step === "confirm" && !insufficientGift);

  const balance = Number(wallet?.balance ?? 0);

  // Most-used gifts first, then the rest by price (high → low).
  const sortedGiftTypes = useMemo(() => {
    if (!giftTypes) return giftTypes;
    const byId = new Map(giftTypes.map((g) => [g.id, g]));
    const topUsed = (topGiftTypeIds ?? []).map((id) => byId.get(id)).filter((g): g is GiftType => !!g);
    const usedIds = new Set(topUsed.map((g) => g.id));
    const rest = giftTypes.filter((g) => !usedIds.has(g.id)).sort((a, b) => b.cost_usd - a.cost_usd);
    return [...topUsed, ...rest];
  }, [giftTypes, topGiftTypeIds]);

  function handleSelect(gift: GiftType) {
    if (!giftingEnabled) return;
    if (balance < gift.cost_usd) {
      haptics.warning();
      setInsufficientGift(gift);
      return;
    }
    haptics.selection();
    setSelected(gift);
    setError(null);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!selected) return;
    setError(null);
    try {
      if (projectId) {
        await sendMediaGift.mutateAsync({ project_id: projectId, gift_type_id: selected.id });
      } else {
        await sendGift.mutateAsync({
          recipient_id: recipientId,
          gift_type_id: selected.id,
          post_id: postId,
          comment_id: commentId,
        });
      }
      haptics.success();
      setStep("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send gift.");
    }
  }

  const insufficientBalance = !!selected && balance < selected.cost_usd;
  const sending = sendGift.isPending || sendMediaGift.isPending;
  const openWallet = () => runAfterDismiss(close, () => router.push("/wallet"));
  const recipientLabel = projectId ? `the creators of ${recipientName}` : recipientName;

  return (
    <>
      {step === "catalog" ? (
        <>
          {!giftingEnabled ? (
            <Text className="py-10 text-center text-sm text-ink-muted">Gifting is temporarily unavailable. Check back later.</Text>
          ) : loadingGifts ? (
            <Text className="py-10 text-center text-sm text-ink-muted">Loading gifts…</Text>
          ) : !sortedGiftTypes || sortedGiftTypes.length === 0 ? (
            <Text className="py-10 text-center text-sm text-ink-muted">No gifts available right now.</Text>
          ) : (
            <View className="flex-row flex-wrap">
              {sortedGiftTypes.map((gift) => (
                <Pressable
                  key={gift.id}
                  onPress={() => handleSelect(gift)}
                  accessibilityRole="button"
                  accessibilityLabel={`${gift.name}, $${gift.cost_usd.toFixed(2)}`}
                  className="items-center gap-1.5 pb-3 active:opacity-70"
                  style={{ width: "33.333%" }}
                >
                  {/* No box: the artifact sits straight on the sheet, contained whole. */}
                  <GiftIcon gift={gift} size={80} />
                  <Text className="text-xs text-ink-muted">${gift.cost_usd.toFixed(2)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : null}

      {step === "confirm" && selected ? (
        <View className="items-center gap-4 py-2">
          <GiftIcon gift={selected} size={80} glyphClass="text-3xl" />

          <View className="items-center">
            <Text className="font-display text-lg text-ink">Send {selected.name}</Text>
            <View className="mt-1 flex-row items-center justify-center gap-2">
              <Avatar src={recipientAvatar} name={recipientName} size="sm" />
              <Text className="text-sm text-ink-muted">to {recipientLabel}</Text>
            </View>
          </View>

          <View className="w-full rounded-xl border border-border bg-canvas p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-ink-muted">Gift value</Text>
              <Text className="text-sm font-medium text-ink">${selected.cost_usd.toFixed(2)}</Text>
            </View>
            <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
              <Text className="text-sm text-ink-muted">Your balance</Text>
              <Text className="text-sm text-ink">${balance.toFixed(2)}</Text>
            </View>
          </View>

          {insufficientBalance ? (
            <View className="w-full rounded-xl bg-danger/10 p-3">
              <Text className="text-sm text-danger">
                {"Insufficient balance. Fund your "}
                <Text className="text-danger underline" accessibilityRole="link" onPress={openWallet}>
                  wallet
                </Text>
                {" to send this gift."}
              </Text>
            </View>
          ) : null}

          {error && !insufficientBalance ? <Text className="text-sm text-danger">{error}</Text> : null}

          <View className="w-full flex-row items-center gap-2 pt-2">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => setStep("catalog")}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={handleConfirm} disabled={insufficientBalance} loading={sending}>
                Send gift
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {step === "sent" && selected ? (
        <View className="items-center gap-3 py-8">
          <SentBurst gift={selected} />
          <Text className="font-display text-lg text-ink">Gift sent!</Text>
          <Text className="text-center text-sm text-ink-muted">
            {`You sent ${article(selected.name)} ${selected.name} to ${recipientLabel}.\n$${selected.cost_usd.toFixed(2)} deducted from your wallet${
              projectId ? ", split across the creators" : ""
            }.`}
          </Text>
          <View className="w-full pt-4">
            <Button onPress={close}>Done</Button>
          </View>
        </View>
      ) : null}

      {insufficientGift ? (
        <InsufficientNotice gift={insufficientGift} onDismiss={() => setInsufficientGift(null)} onOpenWallet={openWallet} />
      ) : null}
    </>
  );
}

export function GiftPicker(props: GiftPickerProps) {
  const [step, setStep] = useState<Step>("catalog");
  const { data: wallet } = useWallet();
  const balance = Number(wallet?.balance ?? 0);

  return (
    <SheetFrame
      title={step === "confirm" ? undefined : "Send a gift"}
      subtitle={step === "confirm" ? undefined : "Send a piece of heritage."}
      onBack={step === "confirm" ? () => setStep("catalog") : undefined}
      headerRight={
        step === "catalog" ? (
          <Text className="text-xs text-ink-muted">
            Balance <Text className="font-medium text-ink">${balance.toFixed(2)}</Text>
          </Text>
        ) : undefined
      }
      onClose={props.onClose}
      accessibilityLabel="Send a gift"
    >
      <Body {...props} step={step} setStep={setStep} />
    </SheetFrame>
  );
}
