// src/components/ui/AkoMark.tsx
// Small theme-aware Akọ icon for compact inline spots (e.g. the notification
// row's "sent by Akọ"). Uses the tagline-free artwork; like the web build it
// shows the *opposite* variant so it contrasts with the surface behind it.
import { useTheme } from "@/theme/ThemeProvider";
import { Image } from "./styled";

const ON_DARK = require("../../../assets/images/app-icon-light-without-tagline.png");
const ON_LIGHT = require("../../../assets/images/app-icon-dark-without-tagline.png");

export function AkoMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const { resolvedTheme } = useTheme();
  return (
    <Image
      source={resolvedTheme === "dark" ? ON_DARK : ON_LIGHT}
      accessibilityElementsHidden
      contentFit="contain"
      style={{ width: size, height: size, borderRadius: 4 }}
      className={`shrink-0 ${className}`}
    />
  );
}
