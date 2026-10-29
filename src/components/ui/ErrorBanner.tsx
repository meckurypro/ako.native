// src/components/ui/ErrorBanner.tsx
//
// The inline way to say "that didn't work" inside a form or settings section — the counterpart to the toast
// (useErrorNotice) for failures that belong next to the thing that failed. Replaces bare red lines of text.
//
//   <ErrorBanner error={saveError} fallback="Couldn't save changes." onRetry={handleSave} onDismiss={() => setSaveError(null)} />
//
// Pass the raw thrown value (or a plain sentence you wrote): it is run through classifyError, so HTTP codes, SQL and
// ids never reach the screen, and the icon, heading and "Try again" follow the kind of failure. A timeout reads as
// "taking too long", not "offline". Renders nothing when `error` is empty.
import { AlertTriangle, Clock, Lock, RefreshCw, WifiOff, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { classifyError, type ErrorKind } from "@/lib/friendlyError";
import { Icon } from "./styled";
import { Text } from "./Text";

const ICONS: Partial<Record<ErrorKind, typeof AlertTriangle>> = {
  network: WifiOff,
  timeout: Clock,
  session: Lock,
  permission: Lock,
};

export interface ErrorBannerProps {
  /** The thrown value, a message string, or null/undefined for "no error". */
  error: unknown;
  /** Wording for "we don't know what happened". */
  fallback: string;
  /** Shows a "Try again" button — only when the failure is one a retry can fix. */
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ error, fallback, onRetry, onDismiss, className = "mb-4" }: ErrorBannerProps) {
  if (error === null || error === undefined || error === false || error === "") return null;
  const e = classifyError(error, fallback);
  const IconComponent = ICONS[e.kind] ?? AlertTriangle;
  const showRetry = Boolean(onRetry) && e.retryable;

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className={`rounded-xl border border-danger-a20 bg-danger-a10 p-3.5 ${className}`}>
      <View className="flex-row items-start gap-3">
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-a15">
          <Icon as={IconComponent} size={16} className="text-danger" />
        </View>
        <View className="min-w-0 flex-1 pt-0.5">
          {e.title ? <Text className="mb-0.5 text-sm font-medium text-ink">{e.title}</Text> : null}
          <Text className="text-sm text-ink-muted">{e.message}</Text>
          {showRetry ? (
            <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again" hitSlop={8} className="mt-2.5 flex-row items-center gap-1.5 self-start">
              <Icon as={RefreshCw} size={14} className="text-ink" />
              <Text className="text-sm font-medium text-ink">Try again</Text>
            </Pressable>
          ) : null}
        </View>
        {onDismiss ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} className="shrink-0 pt-0.5">
            <Icon as={X} size={16} className="text-ink-muted" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
