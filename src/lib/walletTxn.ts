// src/lib/walletTxn.ts
//
// How a wallet transaction reads: label, icon, tint. Shared by the Wallet screen (latest-transaction strip) and the
// Transactions screen (full history). Per-type icons — scanning by icon is faster than reading every line.
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Heart,
  Megaphone,
  Receipt,
  RotateCcw,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react-native";

export const TXN_META: Record<string, { label: string; icon: LucideIcon; positiveTint: boolean }> = {
  fund: { label: "Wallet funded", icon: ArrowDownCircle, positiveTint: true },
  gift_sent: { label: "Gift sent", icon: Gift, positiveTint: false },
  gift_received: { label: "Gift received", icon: Gift, positiveTint: true },
  purchase_sent: { label: "Purchase", icon: Receipt, positiveTint: false },
  purchase_received: { label: "Sale", icon: Receipt, positiveTint: true },
  platform_fee: { label: "Platform fee", icon: Receipt, positiveTint: false },
  withdrawal: { label: "Withdrawal", icon: ArrowUpCircle, positiveTint: false },
  reversal: { label: "Reversal", icon: RotateCcw, positiveTint: true },
  dev_credit: { label: "Dev credit", icon: Sparkles, positiveTint: true },
  affiliate_commission: { label: "Affiliate commission", icon: TrendingUp, positiveTint: true },
  affiliate_commission_reversal: { label: "Affiliate commission reversed", icon: RotateCcw, positiveTint: false },
  promotion_charge: { label: "Promotion charge", icon: Megaphone, positiveTint: false },
  promotion_refund: { label: "Promotion refund", icon: RotateCcw, positiveTint: true },
  give_back: { label: "Give Back reward", icon: Heart, positiveTint: true },
  give_back_reversal: { label: "Give Back reward reversed", icon: RotateCcw, positiveTint: false },
};

export function txnMeta(type: string) {
  return TXN_META[type] ?? { label: type.replace(/_/g, " "), icon: Receipt, positiveTint: false };
}

export interface Txn {
  id: string;
  type: string;
  amount: number | string;
  created_at: string;
}
