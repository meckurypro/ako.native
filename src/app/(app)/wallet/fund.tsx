// src/app/(app)/wallet/fund.tsx
//
// Fund wallet (native). Paystack payment happens ONLY on the web: this screen
// asks initiate-deposit for a hosted-checkout URL, opens it in the in-app
// browser, and Paystack returns the user to /wallet/deposit/return (web) which
// bounces back into the app via ako://wallet/deposit/callback. We then verify
// and land on the funded wallet.
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AlertCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, Text, useToast } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { useInitiateDeposit } from "@/hooks/useDeposits";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useExchangeRates } from "@/hooks/useWalletRates";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { formatNgn, formatUsd } from "@/lib/money";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100];
const MINIMUM_DEPOSIT_USD = 1;
const RETURN_DEEP_LINK = "ako://wallet/deposit/callback";

export default function FundWalletScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: rates } = useExchangeRates();
  const initiateDeposit = useInitiateDeposit();
  const depositsEnabled = useFeatureFlag("deposits_enabled");

  const [selectedPreset, setSelectedPreset] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const amountUsd = customAmount ? Number(customAmount) : selectedPreset ?? 0;

  // Display-only preview — initiate-deposit recomputes the real NGN charge server-side.
  const previewNgn = useMemo(() => {
    if (!rates?.deposit || !amountUsd) return null;
    return amountUsd * rates.deposit;
  }, [rates?.deposit, amountUsd]);

  function selectPreset(usd: number) {
    setSelectedPreset(usd);
    setCustomAmount("");
    setErrorMessage(null);
  }

  function handleCustomChange(value: string) {
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setCustomAmount(value);
      setSelectedPreset(null);
      setErrorMessage(null);
    }
  }

  async function handleContinue() {
    setErrorMessage(null);
    if (!amountUsd || !Number.isFinite(amountUsd) || amountUsd < MINIMUM_DEPOSIT_USD) {
      setErrorMessage(`Minimum deposit is ${formatUsd(MINIMUM_DEPOSIT_USD)}.`);
      return;
    }

    try {
      const result = await initiateDeposit.mutateAsync(amountUsd);

      // Open Paystack's web checkout. The auth session resolves when the browser
      // navigates to our deep link (or the user closes it).
      setOpening(true);
      const session = await WebBrowser.openAuthSessionAsync(result.authorization_url, RETURN_DEEP_LINK);
      setOpening(false);

      // Verify whatever happened — returned via deep link or closed early (the user may
      // have paid and dismissed the browser; verify-deposit is idempotent and the
      // webhook credits independently either way).
      router.replace({ pathname: "/wallet/deposit/callback", params: { reference: result.reference } });
      void session;
    } catch (err) {
      setOpening(false);
      const message = await resolveFunctionErrorMessage(err, "Couldn't start payment.");
      setErrorMessage(message);
      toast(message, { variant: "error" });
    }
  }

  const busy = initiateDeposit.isPending || opening;

  if (!depositsEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Fund your wallet" />
        <View className="px-4">
          <Text className="text-sm text-ink-muted">Deposits are temporarily unavailable. Check back later.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Fund your wallet" />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-6 text-sm text-ink-muted">
          Add money to your Akọ wallet via card, bank transfer, or USSD — powered by Paystack. You'll complete the
          payment securely in your browser, then come straight back here.
        </Text>

        <View className="mb-4 flex-row flex-wrap gap-3">
          {PRESET_AMOUNTS.map((usd) => (
            <Pressable
              key={usd}
              onPress={() => selectPreset(usd)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPreset === usd }}
              className={`w-[30%] items-center rounded-xl border py-4 ${
                selectedPreset === usd ? "border-accent bg-accent-soft" : "border-border bg-surface"
              }`}
            >
              <Text className="font-display text-xl text-ink">{formatUsd(usd)}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              setSelectedPreset(null);
              setErrorMessage(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedPreset === null }}
            className={`w-[30%] items-center rounded-xl border py-4 ${
              selectedPreset === null ? "border-accent bg-accent-soft" : "border-border bg-surface"
            }`}
          >
            <Text className="font-display text-sm text-ink">Custom</Text>
          </Pressable>
        </View>

        {selectedPreset === null ? (
          <View className="mb-6">
            <SurfaceInput
              label="Amount (USD)"
              value={customAmount}
              onChangeText={handleCustomChange}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
        ) : null}

        {amountUsd > 0 ? (
          <View className="mb-6 rounded-xl border border-border bg-surface p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-ink-muted">Add to wallet</Text>
              <Text className="text-sm font-medium text-ink">{formatUsd(amountUsd)}</Text>
            </View>
            <View className="flex-row items-baseline justify-between border-t border-border pt-3">
              <Text className="text-sm text-ink-muted">You'll be charged</Text>
              <Text className="font-display text-2xl text-ink">{previewNgn !== null ? formatNgn(previewNgn) : "…"}</Text>
            </View>
            {rates?.deposit ? (
              <Text className="mt-2 text-right text-xs text-ink-muted">Rate: $1 = {formatNgn(rates.deposit)}</Text>
            ) : null}
          </View>
        ) : null}

        <Button onPress={handleContinue} loading={busy} disabled={!amountUsd}>
          Continue to payment
        </Button>

        {errorMessage ? (
          <View className="mt-4 flex-row gap-2 rounded-xl bg-danger/10 p-3">
            <Icon as={AlertCircle} size={18} className="mt-0.5 shrink-0 text-danger" />
            <Text className="flex-1 text-sm text-danger">{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
