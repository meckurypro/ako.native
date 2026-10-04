// src/components/ui/QrCode.tsx
// QR code drawn as one SVG path (no image generation, works offline). Always
// black-on-white with a quiet-zone margin so any scanner can read it, in light
// and dark mode alike.
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import QRCode from "qrcode/lib/core/qrcode";

export function QrCode({ value, size = 224, margin = 1 }: { value: string; size?: number; margin?: number }) {
  const { path, cells } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = modules.size;
    let d = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (modules.get(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
    return { path: d, cells: n + margin * 2 };
  }, [value, margin]);

  return (
    <View accessibilityRole="image" accessibilityLabel="QR code" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`}>
        <Rect width={cells} height={cells} fill="#ffffff" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
