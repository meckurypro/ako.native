// src/components/ui/BrandDot.tsx
// The brand-orange touch: one small dot after a page title. Orange is the Akọ logo colour, but it is loud, so the
// app spends it sparingly — green stays the working colour (buttons, selection, links) and orange only signs the
// page. Keep it this small; don't use it on buttons, fills or large areas.
import { View } from "react-native";

export function BrandDot({ className = "" }: { className?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange ${className}`}
    />
  );
}
