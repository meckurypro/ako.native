// src/components/nav/RequireFullAccess.tsx
// Native counterpart of web RequireFullAccess. A restricted (consumer-only)
// account is silently redirected away from the Feed and every create/edit-content
// route — no message, no "locked" screen — so from their side those screens
// simply don't exist. Everyone else renders the screen untouched.
//
// Mounted *inside* AuthGate (the (app) layout), which has already resolved the
// access query, so `restricted` is known by the time any screen renders.
import { Redirect, type Href } from "expo-router";
import type { ComponentType } from "react";

import { RESTRICTED_HOME, useIsRestricted } from "@/hooks/useAccountAccess";

export function withFullAccess<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function FullAccessOnly(props: P) {
    const restricted = useIsRestricted();
    if (restricted) return <Redirect href={RESTRICTED_HOME as Href} />;
    return <Screen {...props} />;
  }
  FullAccessOnly.displayName = `withFullAccess(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return FullAccessOnly;
}
