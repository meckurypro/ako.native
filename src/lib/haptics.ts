// src/lib/haptics.ts
// One tiny wrapper so call sites say what they mean ("selection", "success")
// and a missing/disabled haptics engine can never throw into the UI. Replaces
// the web build's navigator.vibrate calls.
import * as Haptics from "expo-haptics";

const swallow = () => {};

export const haptics = {
  /** A light tap — long-press recognised, tab switch, toggle. */
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(swallow),
  /** A firmer tap — drag-to-reply threshold reached, sheet snapped. */
  medium: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(swallow),
  /** Selection changed — scrubbing a picker, switching a segmented control. */
  selection: () => void Haptics.selectionAsync().catch(swallow),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(swallow),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(swallow),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(swallow),
};
