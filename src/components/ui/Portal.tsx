// src/components/ui/Portal.tsx
// Overlay layer, the native stand-in for the web build's <Portal> (which
// rendered to document.body to escape transformed/clipped ancestors).
//
// <PortalHost> sits near the root and paints portalled content ABOVE the rest
// of the screen; <Portal> renders its children there. Layers stack by `zIndex`
// (sheets 50, modals 60, matching the web's tiers), then by mount order.
//
// Why not React Native's <Modal>? A native Modal is its own window, so a Toast
// or another overlay could never sit above it, and it fights the gesture/
// keyboard handling the sheets need. This keeps everything in one tree.
//
// Limitation (same as any portal): portalled children render under the host's
// context providers, not the ones between the host and the <Portal> call site.
// Put app-wide providers (theme, query client, toast, auth) ABOVE the host.
// Screens presented as native modals (presentation: "modal") need their own
// <PortalHost> so overlays open above them.
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

interface Entry {
  zIndex: number;
  order: number;
  node: ReactNode;
}

interface PortalApi {
  set: (key: string, zIndex: number, node: ReactNode) => void;
  remove: (key: string) => void;
}

const PortalContext = createContext<PortalApi | null>(null);

export function PortalHost({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const counter = useRef(0);

  const api = useMemo<PortalApi>(
    () => ({
      set(key, zIndex, node) {
        setEntries((prev) => ({
          ...prev,
          [key]: { zIndex, order: prev[key]?.order ?? counter.current++, node },
        }));
      },
      remove(key) {
        setEntries((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
    }),
    []
  );

  const layers = Object.entries(entries).sort(([, a], [, b]) => a.zIndex - b.zIndex || a.order - b.order);

  return (
    <PortalContext.Provider value={api}>
      {children}
      {layers.map(([key, entry]) => (
        // box-none: the layer itself is transparent to touches; only the
        // portalled content (backdrop, panel…) captures them.
        <View key={key} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: entry.zIndex }]}>
          {entry.node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

export function Portal({ children, zIndex = 50 }: { children: ReactNode; zIndex?: number }) {
  const api = useContext(PortalContext);
  const key = useId();

  if (!api) throw new Error("<Portal> must be rendered inside a <PortalHost>");

  // Mirror the latest children into the host after every render.
  useLayoutEffect(() => {
    api.set(key, zIndex, children);
  });
  useLayoutEffect(() => () => api.remove(key), [api, key]);

  return null;
}
