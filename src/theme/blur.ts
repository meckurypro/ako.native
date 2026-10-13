// src/theme/blur.ts
// Backdrop-blur strengths, tuned by eye against the web build on device.
// expo-blur intensity ≈ 4 × CSS px on Android.
/** Web backdrop-blur-md (bottom nav, top bar): 12px. */
export const NAV_BLUR_INTENSITY = 50;
/** Web backdrop-blur-overlay (sheet / dialog / notice scrims). Retune here only. */
export const OVERLAY_BLUR_INTENSITY = 20;
/** Web backdrop-blur-sm (blocking-save LoadingOverlay): 4px — between the 1.2px overlay and 12px nav values above. */
export const LOADING_BLUR_INTENSITY = 30;
