// src/screens/Offers.tsx
// A creator's offers: bundles of their own paid projects at one price. Buying an offer unlocks every project in it,
// and shoppers about to buy one of them get the offer suggested (see OfferNudgeSheet). Rules live in
// supabase/ako_offers.sql (web repo); max MAX_OFFERS each.
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { Check, Image as ImageIcon, Pencil, Plus, Tag, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  MAX_OFFERS,
  useCreateOffer,
  useDeleteOffer,
  useMyOffers,
  useOfferableProjects,
  useUpdateOffer,
  type Offer,
} from "@/hooks/useOffers";
import { PROJECT_TYPE_LABELS } from "@/hooks/useProjects";
import { formatUsd } from "@/lib/money";

function Thumb({ url, size, isFile }: { url: string | null; size: number; isFile?: boolean }) {
  return (
    <View className="shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas" style={{ width: size, height: size }}>
      {isFile ? <FileFolderIcon size={size} fill /> : url ? <Image source={url} contentFit="cover" className="h-full w-full" /> : <Icon as={ImageIcon} size={14} className="text-ink-muted" />}
    </View>
  );
}

function OfferRow({ offer, onEdit, onDelete }: { offer: Offer; onEdit: () => void; onDelete: () => void }) {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
      <View className="mb-3 gap-2">
        {offer.items.map((item) => (
          <View key={item.id} className="flex-row items-center gap-3">
            <Thumb url={item.thumbnail_url} size={36} isFile={isFileType(item.project_type)} />
            <Text numberOfLines={1} className={`min-w-0 flex-1 text-sm ${item.available ? "text-ink" : "text-ink-muted line-through"}`}>
              {item.title}
            </Text>
            <Text className="shrink-0 text-sm text-ink-muted">{formatUsd(item.price_usd)}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row items-end justify-between gap-3 border-t border-border pt-3">
        <View>
          <Text className="text-xs text-ink-muted">
            Separately <Text className="text-xs text-ink-muted line-through">{formatUsd(offer.sum_usd)}</Text>
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-ink">{formatUsd(offer.price_usd)}</Text>
            {offer.is_valid ? (
              <View className="rounded-full bg-accent-soft px-2 py-0.5">
                <Text className="text-[11px] font-medium text-accent">{`${offer.savings_pct}% off`}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center">
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit offer" hitSlop={8} className="p-2">
            <Icon as={Pencil} size={16} className="text-ink-muted" />
          </Pressable>
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete offer" hitSlop={8} className="p-2">
            <Icon as={Trash2} size={16} className="text-ink-muted" />
          </Pressable>
        </View>
      </View>

      {!offer.is_valid ? (
        <Text className="mt-3 text-xs text-danger">
          {offer.problem === "not_discounted"
            ? "Not shown to buyers: the offer price is no longer lower than buying these projects separately. Edit the price."
            : "Not shown to buyers: a project in this offer is archived, private, free or unpublished. Edit the offer to fix it."}
        </Text>
      ) : null}
    </View>
  );
}

function OfferEditorSheet({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const toast = useToast();
  const { data: offerable, isLoading } = useOfferableProjects();
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();

  const [selected, setSelected] = useState<Set<string>>(() => new Set(offer?.items.map((i) => i.id) ?? []));
  const [price, setPrice] = useState(offer ? String(offer.price_usd) : "");
  const [error, setError] = useState<string | null>(null);
  const saving = createOffer.isPending || updateOffer.isPending;

  // Everything the creator can pick: their offerable projects, plus any project already in this offer that has since
  // become unavailable (so it can be removed).
  const rows = useMemo(() => {
    const list = (offerable ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      thumbnail_url: p.thumbnail_url,
      type: p.project_type,
      price: p.promo_price_usd ?? p.price_usd,
      available: true,
    }));
    const known = new Set(list.map((r) => r.id));
    for (const item of offer?.items ?? []) {
      if (!known.has(item.id)) {
        list.push({ id: item.id, title: item.title, thumbnail_url: item.thumbnail_url, type: item.project_type, price: item.price_usd, available: false });
      }
    }
    return list;
  }, [offerable, offer]);

  const total = rows.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + r.price, 0);
  const priceNum = parseFloat(price);
  const hasPrice = Number.isFinite(priceNum) && priceNum > 0;
  const pct = hasPrice && total > 0 ? Math.round(((total - priceNum) / total) * 100) : 0;

  let hint: string | null = null;
  if (selected.size < 2) hint = "Pick at least 2 projects.";
  else if (!hasPrice) hint = "Enter the offer price.";
  else if (priceNum >= total) hint = `Must be lower than the total (${formatUsd(total)}).`;
  const canSave = hint === null && !saving;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const projectIds = [...selected];
    try {
      if (offer) {
        await updateOffer.mutateAsync({ offerId: offer.id, priceUsd: priceNum, projectIds });
        toast("Offer updated.", { variant: "success" });
      } else {
        await createOffer.mutateAsync({ priceUsd: priceNum, projectIds });
        toast("Offer created.", { variant: "success" });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the offer.");
    }
  }

  return (
    <SheetFrame
      title={offer ? "Edit offer" : "New offer"}
      onClose={onClose}
      avoidKeyboard
      zIndex={55}
      scrim="ink"
      footer={
        <Button onPress={() => void handleSave()} loading={saving} disabled={!canSave}>
          {offer ? "Save changes" : "Create offer"}
        </Button>
      }
    >
      <Text className="mb-2 text-xs text-ink-muted">Choose the projects to bundle</Text>

      {isLoading ? (
        <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
      ) : rows.length < 2 ? (
        <Text className="py-4 text-sm text-ink-muted">
          You need at least two paid, published, public projects (books, courses, media, files, links or meetings) to make an offer.
        </Text>
      ) : (
        <View className="mb-4 gap-1.5">
          {rows.map((r) => {
            const on = selected.has(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => toggle(r.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className={`flex-row items-center gap-3 rounded-xl border p-2 ${on ? "border-accent/50 bg-accent-soft" : "border-border bg-canvas"}`}
              >
                <Thumb url={r.thumbnail_url} size={40} isFile={isFileType(r.type)} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm text-ink">
                    {r.title}
                  </Text>
                  <Text className="text-[11px] text-ink-muted">
                    {`${PROJECT_TYPE_LABELS[r.type]} · ${formatUsd(r.price)}${r.available ? "" : " · no longer available"}`}
                  </Text>
                </View>
                <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-accent bg-accent" : "border-border"}`}>
                  {on ? <Icon as={Check} size={13} className="text-canvas" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <SurfaceInput label="Offer price (USD)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />

      <View className="mb-2 mt-2 min-h-[20px]">
        {selected.size >= 2 ? (
          <Text className="text-xs text-ink-muted">
            {`Separately ${formatUsd(total)}${hasPrice && priceNum < total ? ` · buyers save ${pct}%` : ""}`}
          </Text>
        ) : null}
        {hint ? <Text className="text-xs text-ink-muted">{hint}</Text> : null}
      </View>

      {error ? <Text accessibilityRole="alert" className="mb-2 text-sm text-danger">{error}</Text> : null}
    </SheetFrame>
  );
}

export function Offers() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: offers, isLoading } = useMyOffers();
  const deleteOffer = useDeleteOffer();
  const [editing, setEditing] = useState<Offer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Offer | null>(null);

  const list = offers ?? [];
  const count = list.length;
  const atLimit = count >= MAX_OFFERS;

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteOffer.mutateAsync(deleting.id);
      toast("Offer deleted.", { variant: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete the offer.", { variant: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Offers" right={<Text className="text-xs text-ink-muted">{`${count} of ${MAX_OFFERS}`}</Text>} />
      <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
        <Text className="mb-4 text-sm text-ink-muted">
          Bundle two or more of your paid projects at one price. Buying an offer unlocks everything in it, and people about to buy one of its projects are
          shown the offer.
        </Text>

        <Button onPress={() => setEditing("new")} disabled={atLimit} className="mb-5">
          <View className="flex-row items-center justify-center gap-2">
            <Icon as={Plus} size={16} className="text-canvas" />
            <Text className="text-base font-medium text-canvas">New offer</Text>
          </View>
        </Button>
        {atLimit ? <Text className="-mt-3 mb-5 text-xs text-ink-muted">{`You’ve reached ${MAX_OFFERS} offers. Delete one to add another.`}</Text> : null}

        {isLoading ? (
          <Text className="text-sm text-ink-muted">Loading…</Text>
        ) : count === 0 ? (
          <EmptyNotice icon={Tag} message="No offers yet. You need at least two paid, published projects to make one." />
        ) : (
          list.map((offer) => <OfferRow key={offer.id} offer={offer} onEdit={() => setEditing(offer)} onDelete={() => setDeleting(offer)} />)
        )}
      </ScrollView>

      {editing ? <OfferEditorSheet offer={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this offer?"
          description="People who already bought it keep their access. The offer just stops being sold."
          confirmLabel={deleteOffer.isPending ? "Deleting…" : "Delete"}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}
