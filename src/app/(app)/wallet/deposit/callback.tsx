// src/app/(app)/wallet/deposit/callback.tsx
//
// Landing screen after the web Paystack checkout hands the user back to the app
// (ako://wallet/deposit/callback?reference=…). Verifies the deposit with
// verify-deposit using THIS app's session — never trusting the deep link itself —
// then shows the funded wallet. paystack-charge-webhook credits independently, and
// both converge on the same idempotent server-side credit, so this can't double-credit.
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, Text } from "@/components/ui";
import { useVerifyDeposit } from "@/hooks/useDeposits";
import { formatUsd } from "@/lib/money";

type Result = "pending" | "success" | "failed" | "error";

export default function DepositCallbackScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();
  const reference = (Array.isArray(params.reference) ? params.reference[0] : params.reference) ??
    (Array.isArray(params.trxref) ? params.trxref[0] : params.trxref);

  const verifyDeposit = useVerifyDeposit();
  const [result, setResult] = useState<Result>("pending");
  const [creditedUsd, setCreditedUsd] = useState<number | null>(null);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!reference || attempted.current === reference) return;
    attempted.current = reference;

    verifyDeposit.mutate(reference, {
      onSuccess: (data) => {
        if (data.status === "success") {
          setResult("success");
          setCreditedUsd(data.amount_usd ?? null);
        } else if (data.status === "failed") {
          setResult("failed");
        } else {
          setResult("pending");
        }
      },
      onError: () => setResult("error"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const goToWallet = () => router.replace("/wallet");
  const tryAgain = () => router.replace("/wallet/fund");

  let body;
  if (!reference) {
    body = <Text className="text-center text-ink-muted">Missing payment reference.</Text>;
  } else if (verifyDeposit.isPending) {
    body = (
      <>
        <Icon as={Loader2} size={40} className="mb-4 text-accent" />
        <Text className="font-medium text-ink">Confirming your payment…</Text>
        <Text className="mt-1 text-sm text-ink-muted">This only takes a moment.</Text>
      </>
    );
  } else if (result === "success") {
    body = (
      <>
        <Icon as={CheckCircle2} size={44} className="mb-4 text-accent" />
        <Text className="mb-1 font-display text-xl text-ink">Wallet funded</Text>
        <Text className="mb-6 text-center text-sm text-ink-muted">
          {creditedUsd !== null ? `${formatUsd(creditedUsd)} has been added to your wallet.` : "Your deposit was successful."}
        </Text>
        <Button onPress={goToWallet}>Go to wallet</Button>
      </>
    );
  } else if (result === "failed" || result === "error") {
    body = (
      <>
        <Icon as={XCircle} size={44} className="mb-4 text-danger" />
        <Text className="mb-1 font-display text-xl text-ink">
          {result === "failed" ? "Payment not completed" : "Couldn't confirm payment"}
        </Text>
        <Text className="mb-6 text-center text-sm text-ink-muted">
          {result === "failed"
            ? "Your card or transfer wasn't successful. No funds were added."
            : "We couldn't verify this payment right now. If money left your account, it will still be credited automatically once confirmed."}
        </Text>
        <Button onPress={tryAgain}>Try again</Button>
        <Button variant="ghost" onPress={goToWallet} className="mt-2">
          Go to wallet
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Icon as={Loader2} size={40} className="mb-4 text-ink-muted" />
        <Text className="font-medium text-ink">Still processing</Text>
        <Text className="mb-6 mt-1 text-center text-sm text-ink-muted">
          Your payment is still being confirmed. It'll be credited automatically — check your wallet in a few minutes.
        </Text>
        <Button onPress={goToWallet}>Go to wallet</Button>
      </>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="w-full max-w-sm items-center">{body}</View>
    </View>
  );
}
