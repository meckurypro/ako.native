// src/hooks/useKeyboardInset.ts
// Native port. Reports the on-screen keyboard's height so a chat composer can
// size its emoji tray to match (and swap between keyboard and tray without the
// layout jumping). Same return shape as the web hook:
//   viewportHeight  — window height minus the keyboard
//   insetHeight     — keyboard height right now (0 when hidden)
//   lastKnownHeight — most recent real keyboard height, remembered across launches
import { useEffect, useState } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";

const STORAGE_KEY = "ako-keyboard-height";
const FALLBACK_HEIGHT = 320; // sensible guess until a real keyboard has been measured

export function useKeyboardInset() {
  const { height: windowHeight } = useWindowDimensions();
  const [insetHeight, setInsetHeight] = useState(0);
  const [lastKnownHeight, setLastKnownHeight] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored > 100 ? stored : FALLBACK_HEIGHT;
  });

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      setInsetHeight(h);
      if (h > 100) {
        setLastKnownHeight(h);
        localStorage.setItem(STORAGE_KEY, String(h));
      }
    });
    const hide = Keyboard.addListener(hideEvent, () => setInsetHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { viewportHeight: windowHeight - insetHeight, insetHeight, lastKnownHeight };
}
