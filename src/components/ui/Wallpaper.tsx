// src/components/ui/Wallpaper.tsx
// Chat wallpaper: a dense scatter of African motifs (Adinkra, Nubian and
// Aksumite pyramids, Great Zimbabwe, Benin bronze, kora, talking drum…) —
// 72 icons across hero→micro sizes, circle-packed. Sits behind the message
// list only (MessageThread). Distinct from AuthPattern (sparse mudcloth grid).
//
// Usage — first child of a relative container, real content in a sibling above:
//   <View className="flex-1 bg-canvas overflow-hidden">
//     <Wallpaper />
//     …messages…
//   </View>
//
// The tile (assets/patterns/wallpaper-tile*.png) was rendered from the web
// build's own SVG data (352px repeat = the web's patternTransform scale(0.32)).
import { PatternBackground } from "./PatternBackground";

const TILE = require("../../../assets/patterns/wallpaper-tile.png");

export function Wallpaper() {
  return <PatternBackground tile={TILE} opacity={0.045} />;
}
