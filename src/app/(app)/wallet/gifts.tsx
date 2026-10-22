// src/app/(app)/wallet/gifts.tsx
//
// Gift Vault (native): a trophy cabinet for every gift the user has received.
//   • Plaque — total worth, gifts, artifacts and your prized piece.
//   • Latest — newest gifts first (artwork, sender, date/time, price), filter All / Today / This week.
//   • Artifacts — one tile per gift type with an ×count badge; tapping opens that artifact's history.
// Rarity (Everyday → Legendary) is driven by the price of a single gift.
import { Crown, Gem, Sparkles } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Icon, Image, Text } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useGiftVault } from "@/hooks/useGiftVault";
import { giftIconSource } from "@/lib/giftAssets";
import {
  RARITY_META,
  filterByRange,
  formatReceivedAt,
  groupArtifacts,
  rarityFor,
  senderLabel,
  vaultTotals,
  type Artifact,
  type VaultRange,
} from "@/lib/giftVault";
import { formatUsd } from "@/lib/money";

const RANGES: { id: VaultRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
];

const LATEST_PAGE = 8;
const GOLD = "#D9A857";
const GOLD_DEEP = "#B8862E";
const CREAM = "#F6E7C1";

// Kente-inspired strip: gold, red, deep green, black.
const KENTE_PATTERN = [
  { c: "#D9A857", w: 16 },
  { c: "#A8341F", w: 8 },
  { c: "#14291E", w: 8 },
  { c: "#3D8B63", w: 16 },
  { c: "#14291E", w: 8 },
];

function KenteStrip({ height }: { height: number }) {
  const segments = [];
  for (let i = 0; i < 12; i++) {
    for (const [j, seg] of KENTE_PATTERN.entries()) {
      segments.push(<View key={`${i}-${j}`} style={{ width: seg.w, height, backgroundColor: seg.c }} />);
    }
  }
  return (
    <View style={{ flexDirection: "row", overflow: "hidden", height }} accessibilityElementsHidden>
      {segments}
    </View>
  );
}

function GiftArt({ url, size }: { url: string | null; size: number }) {
  const source = giftIconSource(url);
  if (!source) {
    return (
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Icon as={Sparkles} size={size / 2.5} className="text-ink-muted" />
      </View>
    );
  }
  return <Image source={source} contentFit="contain" style={{ width: size, height: size }} />;
}

export default function GiftVaultScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { data: gifts, isLoading, isError } = useGiftVault();
  const [range, setRange] = useState<VaultRange>("all");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Artifact | null>(null);

  const filtered = useMemo(() => filterByRange(gifts ?? [], range), [gifts, range]);
  const artifacts = useMemo(() => groupArtifacts(filtered), [filtered]);
  const totals = useMemo(() => vaultTotals(filtered), [filtered]);
  const latest = showAll ? filtered : filtered.slice(0, LATEST_PAGE);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Gift Vault" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Plaque ── */}
        <View
          style={{
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: "#16301F",
            borderWidth: 1.5,
            borderColor: GOLD_DEEP,
          }}
        >
          <KenteStrip height={10} />
          <View pointerEvents="none" style={{ position: "absolute", right: -26, top: 22, opacity: 0.12 }}>
            <Icon as={Crown} size={170} strokeWidth={0.8} color={GOLD} />
          </View>
          <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text style={{ color: GOLD, fontSize: 11, letterSpacing: 2.2 }} className="font-medium uppercase">
                  {profile?.username ? `@${profile.username}'s` : "Your"} collection
                </Text>
                <Text style={{ color: CREAM }} className="mt-1 font-display text-4xl">
                  Gift Vault
                </Text>
              </View>
            </View>

            <Text style={{ color: CREAM }} className="mt-6 font-display text-5xl">
              {isLoading ? "…" : formatUsd(totals.totalWorth)}
            </Text>
            <Text style={{ color: "rgba(246,231,193,0.65)" }} className="mt-1 text-xs">
              treasure worth{range === "all" ? "" : ` · ${rangeLabel}`}
            </Text>

            <View className="mt-5 flex-row gap-6">
              <View>
                <Text style={{ color: CREAM }} className="font-display text-2xl">
                  {totals.giftCount}
                </Text>
                <Text style={{ color: "rgba(246,231,193,0.6)", fontSize: 11, letterSpacing: 1 }} className="uppercase">
                  Gifts
                </Text>
              </View>
              <View>
                <Text style={{ color: CREAM }} className="font-display text-2xl">
                  {totals.artifactCount}
                </Text>
                <Text style={{ color: "rgba(246,231,193,0.6)", fontSize: 11, letterSpacing: 1 }} className="uppercase">
                  Artifacts
                </Text>
              </View>
              {totals.topArtifact ? (
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} style={{ color: GOLD }} className="font-display text-2xl">
                    {totals.topArtifact.name}
                  </Text>
                  <Text style={{ color: "rgba(246,231,193,0.6)", fontSize: 11, letterSpacing: 1 }} className="uppercase">
                    Prized piece
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <KenteStrip height={6} />
        </View>

        {/* ── Range switch ── */}
        <View className="mt-6 flex-row gap-2" accessibilityRole="tablist">
          {RANGES.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setRange(r.id);
                setShowAll(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: range === r.id }}
              className={`rounded-full border px-4 py-2 ${
                range === r.id ? "border-accent bg-accent" : "border-border bg-surface"
              }`}
            >
              <Text className={`text-sm ${range === r.id ? "text-canvas" : "text-ink-muted"}`}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? <Skeleton className="mt-8 h-40 w-full rounded-2xl" /> : null}
        {isError ? <Text className="mt-6 text-sm text-danger">Couldn't load your vault. Try again in a moment.</Text> : null}

        {!isLoading && !isError && (gifts?.length ?? 0) === 0 ? (
          <View className="items-center py-14">
            <Icon as={Gem} size={40} className="mb-3 text-ink-muted" />
            <Text className="font-display text-xl text-ink">Your vault is waiting</Text>
            <Text className="mt-1 text-center text-sm text-ink-muted">
              When someone gifts you on Akọ, the treasure lands here — with who sent it and when.
            </Text>
          </View>
        ) : null}

        {!isLoading && (gifts?.length ?? 0) > 0 && filtered.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">No gifts {rangeLabel} yet.</Text>
        ) : null}

        {/* ── Latest ── */}
        {filtered.length > 0 ? (
          <View className="mt-8">
            <Text className="mb-3 font-display text-lg text-ink">Latest</Text>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {latest.map((g, i) => {
                const r = RARITY_META[rarityFor(g.amount)];
                return (
                  <View
                    key={g.id}
                    className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <View
                      className="h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: r.glow, borderWidth: 1, borderColor: r.color }}
                    >
                      <GiftArt url={g.gift_icon_url} size={42} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-medium text-ink">
                        {g.gift_name ?? "Gift"}
                      </Text>
                      <Text numberOfLines={1} className="text-xs text-ink-muted">
                        from {senderLabel(g)}
                      </Text>
                      <Text className="text-xs text-ink-muted">{formatReceivedAt(g.created_at)}</Text>
                    </View>
                    <Text style={{ color: GOLD_DEEP }} className="text-sm font-semibold">
                      {formatUsd(g.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {filtered.length > LATEST_PAGE ? (
              <Pressable onPress={() => setShowAll((v) => !v)} className="mt-3 self-start">
                <Text className="text-sm font-medium text-accent">
                  {showAll ? "Show fewer" : `Show all ${filtered.length}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Artifacts ── */}
        {artifacts.length > 0 ? (
          <View className="mt-10">
            <Text className="font-display text-lg text-ink">Artifacts</Text>
            <Text className="mb-3 text-xs text-ink-muted">Tap one to see everyone who sent it.</Text>
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
              {artifacts.map((a) => {
                const r = RARITY_META[a.rarity];
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => setOpen(a)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, received ${a.count} time${a.count === 1 ? "" : "s"}`}
                    className="items-center rounded-2xl bg-surface p-2.5 pb-3"
                    style={{
                      width: "30.5%",
                      borderWidth: 1.5,
                      borderColor: r.color,
                      shadowColor: r.color,
                      shadowOpacity: a.rarity === "legendary" ? 0.6 : 0.25,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: a.rarity === "legendary" ? 6 : 2,
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: -9,
                        right: -6,
                        minWidth: 26,
                        height: 26,
                        paddingHorizontal: 6,
                        borderRadius: 13,
                        backgroundColor: "#E2B565",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                      }}
                    >
                      <Text style={{ color: "#2A1F12" }} className="text-xs font-bold">
                        ×{a.count}
                      </Text>
                    </View>
                    <View className="aspect-square w-full items-center justify-center">
                      <GiftArt url={a.iconUrl} size={72} />
                    </View>
                    <Text numberOfLines={1} className="mt-1 text-xs font-medium text-ink">
                      {a.name}
                    </Text>
                    <Text style={{ color: r.color, fontSize: 10, letterSpacing: 1 }} className="mt-0.5 uppercase">
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {open ? <ArtifactSheet artifact={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function ArtifactSheet({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const r = RARITY_META[artifact.rarity];
  return (
    <SheetFrame title={artifact.name} subtitle={`${r.label} · ${formatUsd(artifact.unitPrice)} each`} onClose={onClose}>
      <View className="items-center px-4 pb-6 pt-4">
        <View
          className="h-36 w-36 items-center justify-center"
          style={{ borderRadius: 32, backgroundColor: r.glow, borderWidth: 1.5, borderColor: r.color }}
        >
          <GiftArt url={artifact.iconUrl} size={104} />
        </View>

        <View className="mt-4 flex-row gap-8">
          <View className="items-center">
            <Text className="font-display text-2xl text-ink">×{artifact.count}</Text>
            <Text className="text-[11px] uppercase text-ink-muted">Received</Text>
          </View>
          <View className="items-center">
            <Text style={{ color: GOLD_DEEP }} className="font-display text-2xl">
              {formatUsd(artifact.totalWorth)}
            </Text>
            <Text className="text-[11px] uppercase text-ink-muted">Worth</Text>
          </View>
        </View>

        <Text className="mb-2 mt-6 self-start text-xs font-medium uppercase text-ink-muted">History</Text>
        <View className="w-full">
          {artifact.history.map((g, i) => (
            <View key={g.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
              <Avatar src={g.sender_avatar_url} name={senderLabel(g).replace(/^@/, "")} size="sm" />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-ink">
                  {senderLabel(g)}
                </Text>
                <Text className="text-xs text-ink-muted">{formatReceivedAt(g.created_at)}</Text>
              </View>
              <Text style={{ color: GOLD_DEEP }} className="text-sm">
                {formatUsd(g.amount)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </SheetFrame>
  );
}
