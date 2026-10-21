// src/components/project/OfferNudgeSheet.tsx
// Shown INSTEAD of buying immediately when the project the viewer taps "Buy" on is part of one or more of the
// creator's offers. A suggestion, never a wall: the bundle leads, each project's own price sits next to the offer
// price so the saving is obvious, and "just this one" is always one quiet tap away. Only ever opened by a caller
// that already checked the viewer is a signed-in, non-owner buyer with no access yet.
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { Image as ImageIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { PurchaseError } from "@/components/wallet/PurchaseError";
import { usePurchaseOffer, type Offer } from "@/hooks/useOffers";
import { formatUsd } from "@/lib/money";

interface OfferNudgeSheetProps {
  /** The project the viewer was about to buy. */
  projectId: string;
  projectTitle: string;
  /** What buying just this project costs (effective price). */
  singlePrice: number;
  /** Valid offers containing this project, best saving first (see useOfferNudge). */
  offers: Offer[];
  /** Carries on with the normal single-project purchase. */
  onBuySingle: () => void;
  onClose: () => void;
}

function OfferCard({
  offer,
  projectId,
  featured,
  busy,
  buying,
  onBuy,
}: {
  offer: Offer;
  projectId: string;
  featured?: boolean;
  busy: boolean;
  buying: boolean;
  onBuy: () => void;
}) {
  return (
    <View className={`rounded-2xl border p-3 ${featured ? "border-accent/40 bg-accent-soft" : "border-border bg-canvas"}`}>
      <View className="gap-2">
        {offer.items.map((item) => (
          <View key={item.id} className="flex-row items-center gap-3">
            <View className="h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
              {isFileType(item.project_type) ? (
                <FileFolderIcon />
              ) : item.thumbnail_url ? (
                <Image source={item.thumbnail_url} contentFit="cover" className="h-full w-full" />
              ) : (
                <Icon as={ImageIcon} size={14} className="text-ink-muted" />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm text-ink">
                {item.title}
              </Text>
              {item.id === projectId ? <Text className="text-[11px] text-ink-muted">The one you’re buying</Text> : null}
            </View>
            <Text className="shrink-0 text-sm text-ink-muted">{formatUsd(item.price_usd)}</Text>
          </View>
        ))}
      </View>

      <View className="mt-3 border-t border-border pt-3">
        <Text className="text-xs text-ink-muted">
          Separately <Text className="text-xs text-ink-muted line-through">{formatUsd(offer.sum_usd)}</Text>
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-ink">{formatUsd(offer.price_usd)}</Text>
          <View className="rounded-full bg-accent-soft px-2 py-0.5">
            <Text className="text-[11px] font-medium text-accent">Save {formatUsd(offer.savings_usd)}</Text>
          </View>
        </View>
      </View>

      <View className="mt-3">
        <Button variant={featured ? "primary" : "secondary"} onPress={onBuy} loading={buying} disabled={busy}>
          {`Get all ${offer.items.length} for ${formatUsd(offer.price_usd)}`}
        </Button>
      </View>
    </View>
  );
}

export function OfferNudgeSheet({ projectId, projectTitle, singlePrice, offers, onBuySingle, onClose }: OfferNudgeSheetProps) {
  const toast = useToast();
  const purchaseOffer = usePurchaseOffer();
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  async function handleBuyOffer(offer: Offer) {
    setError(null);
    setBuyingId(offer.id);
    try {
      const result = await purchaseOffer.mutateAsync(offer.id);
      toast(`Unlocked ${result.purchases.length} projects 🎉`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete the purchase.");
    } finally {
      setBuyingId(null);
    }
  }

  const [best, ...others] = offers;
  if (!best) return null;
  const busy = purchaseOffer.isPending;

  return (
    <SheetFrame title="Better together" subtitle={`Adding to “${projectTitle}”? Pay less for the set.`} onClose={onClose} zIndex={55} scrim="ink">
      <OfferCard offer={best} projectId={projectId} featured busy={busy} buying={buyingId === best.id} onBuy={() => void handleBuyOffer(best)} />

      {others.length > 0 ? (
        <View className="mt-3 gap-2">
          {others.map((offer) => (
            <OfferCard key={offer.id} offer={offer} projectId={projectId} busy={busy} buying={buyingId === offer.id} onBuy={() => void handleBuyOffer(offer)} />
          ))}
        </View>
      ) : null}

      {error ? <PurchaseError message={error} className="mt-3" /> : null}

      <Pressable
        onPress={() => {
          onClose();
          onBuySingle();
        }}
        disabled={busy}
        accessibilityRole="button"
        hitSlop={8}
        className={`mb-2 mt-4 self-center ${busy ? "opacity-50" : ""}`}
      >
        <Text className="text-xs text-ink-muted underline">{`Just this one — ${formatUsd(singlePrice)}`}</Text>
      </Pressable>
    </SheetFrame>
  );
}
