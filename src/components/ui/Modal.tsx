// src/components/ui/Modal.tsx
// The one wrapper every centered dialog goes through (ConfirmDialog,
// AddAccountModal, PageInviteResponseModal, …). Renders on the overlay layer
// (Portal), dims the screen, closes on scrim tap and on Android Back.
// Pass `bare` when the content brings its own card chrome.
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import { useAnchoredPanel } from "@/hooks/useAnchoredPanel";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { GlassScrim } from "./GlassScrim";
import { KeyboardAvoider } from "./KeyboardAvoider";
import { OverlayPanel, PopoverPanel, SCRIM_BOX } from "./OverlayPanel";
import { Portal } from "./Portal";
import { Text } from "./Text";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  /** Max card width in px (web: max-w-sm = 384). Override for roomier forms. */
  maxWidth?: number;
  /** Skip the card chrome and just provide the centered, scrollable box. */
  bare?: boolean;
  /** Vertical placement: centred (default) or docked to the bottom (stance/comment composers). */
  align?: "center" | "bottom";
  /** Layer tier. Default 60 sits above sheets (50); ArchivedPostModal uses 40 so sheets it spawns stack above it. */
  zIndex?: number;
  /** Backdrop: default black/40 (web Modal). "canvas" = canvas/70, used by the composer-style modals that are sheets on web. */
  scrim?: "black" | "canvas";
  /** Follow the app theme (light panel + dark text, or dark panel + light text) instead of the fixed dark glass. */
  themed?: boolean;
  /** Heading shown at the top of the card. Every modal has one; it stays pinned while the body scrolls. */
  title?: string;
}

export function Modal({
  onClose,
  children,
  role = "dialog",
  ariaLabel,
  maxWidth = 384,
  bare = false,
  align = "center",
  zIndex = 60,
  scrim = "black",
  themed = false,
  title,
}: ModalProps) {
  useBackDismiss(onClose);

  // A bottom-docked modal must clear the system navigation bar (3-button / gesture area). KeyboardAvoider's
  // animated paddingBottom replaces any static padding class, so the clearance is a spacer instead: inset + 16px
  // breathing room. The keyboard overlaps the inset, so it is passed as reservedBottom and not counted twice.
  const insets = useSafeAreaInsets();
  const docked = align === "bottom";

  // Centred cards: centred on open, then the top edge stays put and the card grows downward until it nears the bottom
  // nav, after which the body scrolls (see useAnchoredPanel). Bottom-docked composers keep their own placement.
  const anchored = useAnchoredPanel();

  const header = title ? (
    <Text className="px-6 pb-3 pt-6 text-lg font-semibold text-overlay-ink">{title}</Text>
  ) : null;
  const body = (
    <ScrollView showsHorizontalScrollIndicator={false}
      bounces={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flexShrink: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: title ? 0 : 24 }}
    >
      {children}
    </ScrollView>
  );
  const card = bare ? (
    <ScrollView showsHorizontalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
      {children}
    </ScrollView>
  ) : themed ? (
    <PopoverPanel className="rounded-[28px]" style={{ flexShrink: 1, overflow: "hidden" }}>
      {header}
      {body}
    </PopoverPanel>
  ) : (
    <OverlayPanel className="rounded-[28px]" style={{ flexShrink: 1, overflow: "hidden" }}>
      {header}
      {body}
    </OverlayPanel>
  );

  return (
    <Portal zIndex={zIndex}>
      <KeyboardAvoider
        reservedBottom={docked ? insets.bottom : 0}
        className={`flex-1 items-center px-6 ${docked ? "justify-end" : "justify-start"}`}
        accessibilityViewIsModal
        accessibilityRole={role === "alertdialog" ? "alert" : undefined}
        accessibilityLabel={ariaLabel ?? title}
      >
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={SCRIM_BOX}>
          <GlassScrim tone={scrim === "canvas" ? "canvas" : "black"} />
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        {docked ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={{ width: "100%", maxWidth, maxHeight: "85%" }}
          >
            <Animated.View entering={ZoomIn.duration(180).withInitialValues({ transform: [{ scale: 0.96 }] })} style={{ flexShrink: 1 }}>
              {card}
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View style={[{ width: "100%", maxWidth }, anchored.style]} onLayout={anchored.onLayout}>
            <Animated.View
              entering={ZoomIn.duration(180).withInitialValues({ transform: [{ scale: 0.96 }] })}
              exiting={FadeOut.duration(120)}
              style={{ flexShrink: 1 }}
            >
              {card}
            </Animated.View>
          </Animated.View>
        )}
        {docked ? <View style={{ height: insets.bottom + 16 }} /> : null}
      </KeyboardAvoider>
    </Portal>
  );
}
