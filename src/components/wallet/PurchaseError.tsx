// src/components/wallet/PurchaseError.tsx
// Error line for a failed purchase/booking. When the reason is a low wallet
// balance, adds a one-tap "Fund wallet" link so the buyer isn't left at a dead end.
import { router } from "expo-router";

import { Text } from "@/components/ui";

const LOW_BALANCE = /insufficient balance|fund your wallet/i;

export function PurchaseError({ message, className = "" }: { message: string; className?: string }) {
  const lowBalance = LOW_BALANCE.test(message);
  return (
    <Text accessibilityRole="alert" className={`text-sm text-danger ${className}`}>
      {lowBalance ? "Your wallet balance is too low for this. " : message}
      {lowBalance ? (
        <Text className="text-danger underline" accessibilityRole="link" onPress={() => router.push("/wallet/fund")}>
          Fund wallet
        </Text>
      ) : null}
    </Text>
  );
}
