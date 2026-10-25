// src/lib/customPageScroll.ts
//
// Animated scroll-to-section for Custom Pages on native (twin of the web file). React Native's own animated scrollTo
// has a single curve, so the easing runs in requestAnimationFrame and drives ScrollView.scrollTo frame by frame.
// The curves and durations match the web, so a page scrolls the same way everywhere.
import { SCROLL_ANIMATIONS, type ScrollAnimationId } from "./customPage";

export type Ease = (t: number) => number;

const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuart: Ease = (t) => 1 - Math.pow(1 - t, 4);
const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutExpo: Ease = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutBounce: Ease = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const EASES: Record<Exclude<ScrollAnimationId, "instant">, Ease> = {
  smooth: easeInOutCubic,
  "ease-out": easeOutQuart,
  spring: easeOutBack,
  bounce: easeOutBounce,
  slow: easeInOutSine,
  snap: easeOutExpo,
};

/** Long trips take a little longer, short hops a little less, so a nearby section doesn't feel sluggish. */
export function scrollDuration(animation: ScrollAnimationId, distance: number): number {
  const def = SCROLL_ANIMATIONS.find((a) => a.id === animation);
  if (!def || def.ms === 0) return 0;
  return Math.round(def.ms * Math.min(1.35, Math.max(0.6, distance / 900 + 0.35)));
}

/**
 * Runs one scroll animation from `from` to `to`, calling `set(y)` each frame. Returns a function that cancels it
 * (call it when the visitor grabs the page). `instant`, reduced motion and tiny distances jump straight there.
 */
export function animateScroll(opts: { from: number; to: number; animation: ScrollAnimationId; reduceMotion?: boolean; set: (y: number) => void; onDone?: () => void }): () => void {
  const { from, to, animation, set } = opts;
  const distance = Math.abs(to - from);
  const duration = scrollDuration(animation, distance);
  if (animation === "instant" || opts.reduceMotion || duration === 0 || distance < 2) {
    set(to);
    opts.onDone?.();
    return () => {};
  }
  const ease = EASES[animation];
  const t0 = Date.now();
  let raf = 0;
  let stopped = false;
  const step = () => {
    if (stopped) return;
    const t = Math.min(1, (Date.now() - t0) / duration);
    set(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else {
      set(to);
      opts.onDone?.();
    }
  };
  raf = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
