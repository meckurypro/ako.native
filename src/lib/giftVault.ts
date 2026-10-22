// src/lib/giftVault.ts
//
// Pure logic for the Gift Vault (shared shape with ako/src/lib/giftVault.ts —
// keep the two in sync). The server (get_gift_vault) returns one row per received
// gift; everything here — range filtering, grouping into artifacts, rarity — is
// derived on the client from those rows.

export interface VaultGift {
  id: string;
  created_at: string;
  amount: number;
  gift_type_id: string | null;
  gift_name: string | null;
  gift_icon_url: string | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
}

export type VaultRange = "all" | "today" | "week";

export type Rarity = "everyday" | "treasured" | "royal" | "legendary";

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  everyday: { label: "Everyday", color: "#9A8F7A", glow: "rgba(154,143,122,0.25)" },
  treasured: { label: "Treasured", color: "#3D8B63", glow: "rgba(61,139,99,0.35)" },
  royal: { label: "Royal", color: "#B8862E", glow: "rgba(184,134,46,0.45)" },
  legendary: { label: "Legendary", color: "#D9A857", glow: "rgba(217,168,87,0.7)" },
};

/** Rarity is driven by what ONE of the gift costs, so ten Cowries never outrank a Golden Stool. */
export function rarityFor(unitPrice: number): Rarity {
  if (unitPrice >= 25) return "legendary";
  if (unitPrice >= 5) return "royal";
  if (unitPrice >= 1) return "treasured";
  return "everyday";
}

export interface Artifact {
  key: string;
  name: string;
  iconUrl: string | null;
  count: number;
  totalWorth: number;
  unitPrice: number;
  rarity: Rarity;
  latestAt: string;
  /** Newest first. */
  history: VaultGift[];
}

export function filterByRange(gifts: VaultGift[], range: VaultRange, now: Date = new Date()): VaultGift[] {
  if (range === "all") return gifts;
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 7);
  }
  const startMs = start.getTime();
  return gifts.filter((g) => new Date(g.created_at).getTime() >= startMs);
}

/** Groups gifts by gift type. Most-received first; ties go to the more valuable artifact. */
export function groupArtifacts(gifts: VaultGift[]): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const g of gifts) {
    const key = g.gift_type_id ?? g.gift_name ?? g.id;
    const amount = Number(g.amount) || 0;
    let a = map.get(key);
    if (!a) {
      a = {
        key,
        name: g.gift_name ?? "Gift",
        iconUrl: g.gift_icon_url,
        count: 0,
        totalWorth: 0,
        unitPrice: amount,
        rarity: rarityFor(amount),
        latestAt: g.created_at,
        history: [],
      };
      map.set(key, a);
    }
    a.count += 1;
    a.totalWorth += amount;
    // Price today, not at gifting time, would drift; the highest price paid represents the artifact.
    if (amount > a.unitPrice) {
      a.unitPrice = amount;
      a.rarity = rarityFor(amount);
    }
    if (g.created_at > a.latestAt) a.latestAt = g.created_at;
    a.history.push(g);
  }
  for (const a of map.values()) {
    a.history.sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.totalWorth - a.totalWorth);
}

export function senderLabel(g: Pick<VaultGift, "sender_display_name" | "sender_username">): string {
  const name = g.sender_display_name?.trim();
  if (name) return name;
  if (g.sender_username) return `@${g.sender_username}`;
  return "A friend of Akọ";
}

export function formatReceivedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function vaultTotals(gifts: VaultGift[]) {
  const artifacts = groupArtifacts(gifts);
  return {
    giftCount: gifts.length,
    artifactCount: artifacts.length,
    totalWorth: gifts.reduce((sum, g) => sum + (Number(g.amount) || 0), 0),
    topArtifact: artifacts.reduce<Artifact | null>(
      (best, a) => (!best || a.unitPrice > best.unitPrice ? a : best),
      null,
    ),
  };
}
