// src/components/post/GiftPicker.tsx
// Send a gift: catalogue → confirm → sent. Opens above other sheets (zIndex 60).
// Gift art ships inside the app (lib/giftAssets); the "sent" step plays a small
// pop + rising-glyph moment.
//
// One overlay for every entry point (post, comment, project): a FIXED-size card (heightRatio) so it never depends on
// the route's bottom nav, the loading state or when the first layout pass happened. The catalogue scrolls inside it,
// confirm / sent centre their content, and the actions are docked in the footer. Mirrors web/GiftPicker.tsx.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { router } from "expo-router";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassScrim } from "@/components/ui/GlassScrim";
import { GLASS_ABOVE_Z, Portal } from "@/components/ui/Portal";
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
import { friendlyError } from "@/lib/friendlyError";

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

/** Fraction of the screen the card occupies on every step (capped by the safe area inside Sheet). */
const CARD_HEIGHT_RATIO = 0.8;
const SKELETON_TILES = 12;

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

/** Pulsing placeholder on the canvas tone (the shared Skeleton is surface-on-surface, invisible inside a sheet). */
function PulseBlock({ className }: { className: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.5, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className={`bg-canvas ${className}`} />;
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
    <Portal zIndex={GLASS_ABOVE_Z}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        className="flex-1 items-center justify-center gap-4 px-10"
        // Web: bg-canvas/70 + backdrop-blur-overlay. GlassScrim = real blur + the tint, drawn
        // inline (the /70 class resolves to NO background on device).
      >
        <GlassScrim />
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

/** One catalogue tile: art, name, price. Unaffordable gifts are dimmed (still tappable → the balance notice). */
function GiftTile({ gift, affordable, onPress }: { gift: GiftType; affordable: boolean; onPress: (g: GiftType) => void }) {
  return (
    <Pressable
      onPress={() => onPress(gift)}
      accessibilityRole="button"
      accessibilityLabel={`${gift.name}, $${gift.cost_usd.toFixed(2)}${affordable ? "" : ", not enough balance"}`}
      className="pb-2 active:opacity-70"
      style={{ width: "33.333%" }}
    >
      <View className="items-center gap-1 py-1" style={{ opacity: affordable ? 1 : 0.5 }}>
        {/* No box: the artifact sits straight on the sheet, contained whole. */}
        <GiftIcon gift={gift} size={64} />
        <Text numberOfLines={1} className="w-full px-1 text-center text-[11px] leading-tight text-ink">
          {gift.name}
        </Text>
        <Text className="text-xs font-medium text-ink-muted">${gift.cost_usd.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{children}</Text>;
}

interface BodyProps {
  step: Step;
  recipientAvatar: string | null;
  recipientName: string;
  recipientLabel: string;
  projectId?: string;
  selected: GiftType | null;
  balance: number;
  error: string | null;
  insufficientBalance: boolean;
  insufficientGift: GiftType | null;
  dismissInsufficient: () => void;
  giftingEnabled: boolean;
  loadingGifts: boolean;
  topUsed: GiftType[];
  rest: GiftType[];
  onSelect: (g: GiftType) => void;
}

function Body({
  step,
  recipientAvatar,
  recipientName,
  recipientLabel,
  projectId,
  selected,
  balance,
  error,
  insufficientBalance,
  insufficientGift,
  dismissInsufficient,
  giftingEnabled,
  loadingGifts,
  topUsed,
  rest,
  onSelect,
}: BodyProps) {
  const { close } = useSheet();
  const openWallet = () => runAfterDismiss(close, () => router.push("/wallet"));
  const hasGifts = topUsed.length + rest.length > 0;

  return (
    <View style={{ flex: 1 }}>
      {step === "catalog" ? (
        <>
          {/* Who the gift is going to — same line for every entry point. */}
          <View className="shrink-0 flex-row items-center gap-2 border-b border-border px-4 py-2">
            <Avatar src={recipientAvatar} name={recipientName} size="sm" />
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink-muted">
              {"To "}
              <Text className="text-sm font-medium text-ink">{recipientLabel}</Text>
            </Text>
          </View>

          {!giftingEnabled ? (
            <Text className="py-10 text-center text-sm text-ink-muted">Gifting is temporarily unavailable. Check back later.</Text>
          ) : loadingGifts ? (
            // Skeleton tiles in the real grid: the (fixed-size) card looks the same loading as full.
            <View className="flex-row flex-wrap px-4 py-3" accessibilityLabel="Loading gifts">
              {Array.from({ length: SKELETON_TILES }).map((_, i) => (
                <View key={i} className="items-center gap-1.5 pb-2 pt-1" style={{ width: "33.333%" }}>
                  <PulseBlock className="h-16 w-16 rounded-full" />
                  <PulseBlock className="h-2.5 w-14 rounded" />
                  <PulseBlock className="h-2.5 w-8 rounded" />
                </View>
              ))}
            </View>
          ) : !hasGifts ? (
            <Text className="py-10 text-center text-sm text-ink-muted">No gifts available right now.</Text>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerClassName="px-4 py-3 gap-3"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {topUsed.length > 0 ? (
                <View>
                  <SectionLabel>Most used</SectionLabel>
                  <View className="flex-row flex-wrap">
                    {topUsed.map((g) => (
                      <GiftTile key={g.id} gift={g} affordable={balance >= g.cost_usd} onPress={onSelect} />
                    ))}
                  </View>
                </View>
              ) : null}
              <View>
                {topUsed.length > 0 ? <SectionLabel>All gifts</SectionLabel> : null}
                <View className="flex-row flex-wrap">
                  {rest.map((g) => (
                    <GiftTile key={g.id} gift={g} affordable={balance >= g.cost_usd} onPress={onSelect} />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </>
      ) : null}

      {step === "confirm" && selected ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
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
            <View className="w-full rounded-xl bg-danger-a10 p-3">
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
        </View>
      ) : null}

      {step === "sent" && selected ? (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <SentBurst gift={selected} />
          <Text className="font-display text-lg text-ink">Gift sent!</Text>
          <Text className="text-center text-sm text-ink-muted">
            {`You sent ${article(selected.name)} ${selected.name} to ${recipientLabel}.\n$${selected.cost_usd.toFixed(2)} deducted from your wallet${
              projectId ? ", split across the creators" : ""
            }.`}
          </Text>
        </View>
      ) : null}

      {insufficientGift ? <InsufficientNotice gift={insufficientGift} onDismiss={dismissInsufficient} onOpenWallet={openWallet} /> : null}
    </View>
  );
}

/** Docked actions. A component (not inline JSX) so "Done" can use useSheet() — SheetFrame renders it inside the Sheet. */
function Footer({
  step,
  onCancel,
  onConfirm,
  confirmDisabled,
  sending,
}: {
  step: Step;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
  sending: boolean;
}) {
  const { close } = useSheet();
  if (step === "sent") return <Button onPress={close}>Done</Button>;
  return (
    <View className="w-full flex-row items-center gap-2">
      <View className="flex-1">
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
      </View>
      <View className="flex-1">
        <Button onPress={onConfirm} disabled={confirmDisabled} loading={sending}>
          Send gift
        </Button>
      </View>
    </View>
  );
}

export function GiftPicker({ recipientId, recipientName, recipientAvatar, postId, commentId, projectId, onClose }: GiftPickerProps) {
  const [step, setStep] = useState<Step>("catalog");
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insufficientGift, setInsufficientGift] = useState<GiftType | null>(null);

  const { data: giftTypes, isLoading: loadingTypes } = useGiftTypes();
  const { data: wallet } = useWallet();
  const { data: topGiftTypeIds, isLoading: loadingTop } = useTopGiftTypeIds(6);
  // Wait for the "most used" order too, so the grid never reshuffles after it appears.
  const loadingGifts = loadingTypes || loadingTop;
  const sendGift = useSendGift();
  const sendMediaGift = useSendMediaGift();
  const giftingEnabled = useFeatureFlag("gifting_enabled");

  useBackDismiss(() => setInsufficientGift(null), !!insufficientGift);
  // Back from the confirm step is handled by SheetFrame (onBack → Sheet.onBackStep).

  const balance = Number(wallet?.balance ?? 0);

  // The user's own top 6 most-used gifts lead ("Most used"), then the rest by price (high → low).
  const { topUsed, rest } = useMemo(() => {
    if (!giftTypes) return { topUsed: [] as GiftType[], rest: [] as GiftType[] };
    const byId = new Map(giftTypes.map((g) => [g.id, g]));
    const topUsed = (topGiftTypeIds ?? []).map((id) => byId.get(id)).filter((g): g is GiftType => !!g);
    const usedIds = new Set(topUsed.map((g) => g.id));
    const rest = giftTypes.filter((g) => !usedIds.has(g.id)).sort((a, b) => b.cost_usd - a.cost_usd);
    return { topUsed, rest };
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
      setError(friendlyError(err, "Couldn't send gift."));
    }
  }

  const insufficientBalance = !!selected && balance < selected.cost_usd;
  const sending = sendGift.isPending || sendMediaGift.isPending;
  // Same wording on every entry point (post, comment, project): the overlay always says who it is going to.
  const recipientLabel = projectId ? `the creators of ${recipientName}` : recipientName;

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
      heightRatio={CARD_HEIGHT_RATIO}
      bodyScroll={false}
      footer={
        step === "catalog" ? undefined : (
          <Footer
            step={step}
            onCancel={() => setStep("catalog")}
            onConfirm={handleConfirm}
            confirmDisabled={insufficientBalance}
            sending={sending}
          />
        )
      }
      onClose={onClose}
      accessibilityLabel="Send a gift"
    >
      <Body
        step={step}
        recipientAvatar={recipientAvatar}
        recipientName={recipientName}
        recipientLabel={recipientLabel}
        projectId={projectId}
        selected={selected}
        balance={balance}
        error={error}
        insufficientBalance={insufficientBalance}
        insufficientGift={insufficientGift}
        dismissInsufficient={() => setInsufficientGift(null)}
        giftingEnabled={giftingEnabled}
        loadingGifts={loadingGifts}
        topUsed={topUsed}
        rest={rest}
        onSelect={handleSelect}
      />
    </SheetFrame>
  );
}
