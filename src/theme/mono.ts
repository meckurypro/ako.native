// src/theme/mono.ts
// System monospace face (web's `font-mono` fell back to the OS one too).
import { Platform } from "react-native";

export const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
