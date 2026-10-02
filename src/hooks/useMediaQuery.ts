// src/hooks/useMediaQuery.ts
// Native port. CSS media-query strings don't exist here; the one query the app
// used was "is this a desktop-width layout", which becomes a window-width check
// (tablets / foldables in landscape).
import { useWindowDimensions } from "react-native";

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}
