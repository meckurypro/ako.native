// src/components/ui/Modal.tsx
// The one wrapper every centered dialog goes through (ConfirmDialog,
// AddAccountModal, PageInviteResponseModal, …). Renders on the overlay layer
// (Portal), dims the screen, closes on scrim tap and on Android Back.
// Pass `bare` when the content brings its own card chrome.
import type { ReactNode } from "react";
import { Pressable, ScrollView } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import { useBackDismiss } from "@/hooks/useBackDismiss";
import { GlassScrim } from "./GlassScrim";
import { KeyboardAvoider } from "./KeyboardAvoider";
import { OverlayPanel, SCRIM_BOX } from "./OverlayPanel";
import { Portal } from "./Portal";

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
}: ModalProps) {
  useBackDismiss(onClose);

  return (
    <Portal zIndex={zIndex}>
      <KeyboardAvoider
        className={`flex-1 items-center px-6 ${align === "bottom" ? "justify-end pb-4" : "justify-center"}`}
        accessibilityViewIsModal
        accessibilityRole={role === "alertdialog" ? "alert" : undefined}
        accessibilityLabel={ariaLabel}
      >
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={SCRIM_BOX}>
          <GlassScrim tone={scrim === "canvas" ? "canvas" : "black"} />
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={{ width: "100%", maxWidth, maxHeight: "85%" }}
        >
          <Animated.View entering={ZoomIn.duration(180).withInitialValues({ transform: [{ scale: 0.96 }] })}>
            {bare ? (
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <OverlayPanel className="rounded-[28px]">
                <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerClassName="p-6">
                  {children}
                </ScrollView>
              </OverlayPanel>
            )}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoider>
    </Portal>
  );
}

