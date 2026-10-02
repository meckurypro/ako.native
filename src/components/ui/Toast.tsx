// src/components/ui/Toast.tsx
// Fire a toast from anywhere: `const toast = useToast(); toast("Saved.")`.
// Every toast auto-dismisses at 2s (nothing should overstay that).
//
// Mount <ToastProvider> ABOVE <PortalHost>: the viewport is a sibling painted
// after the app's children, so toasts always sit above modals and sheets
// (web: z-[70] over z-50/60).
import { CheckCircle2, Info, XCircle } from "lucide-react-native";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./styled";
import { Text } from "./Text";

type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastOptions {
  variant?: ToastVariant;
  /** ms before auto-dismiss (default 2000). */
  duration?: number;
}

type ToastFn = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

const DEFAULT_DURATION_MS = 2000;

function ToastIcon({ variant }: { variant: ToastVariant }) {
  // Toasts are ink-on-canvas inverted (bg-ink / text-canvas), so the icon
  // tints use the *on-dark-surface* reading of each semantic colour.
  if (variant === "success") return <Icon as={CheckCircle2} size={18} className="shrink-0 text-accent" />;
  if (variant === "error") return <Icon as={XCircle} size={18} className="shrink-0 text-danger" />;
  return <Icon as={Info} size={18} className="shrink-0 text-ink-muted" />;
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center gap-2 px-4"
      style={{ paddingBottom: insets.bottom + 96, zIndex: 70 }}
    >
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOut.duration(120)}
          layout={LinearTransition}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="w-full max-w-sm flex-row items-start gap-2.5 rounded-2xl bg-ink px-4 py-3"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <ToastIcon variant={t.variant} />
          <Text className="flex-1 text-sm leading-snug text-canvas">{t.message}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback<ToastFn>((message, options) => {
    const id = nextId.current++;
    const variant = options?.variant ?? "default";
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options?.duration ?? DEFAULT_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <View style={{ flex: 1 }}>
        {children}
        <ToastViewport toasts={toasts} />
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
