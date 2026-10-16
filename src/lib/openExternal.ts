// src/lib/openExternal.ts
// The one way the app opens a link in the browser or another app. A web link that leaves Akọ
// asks first (see ExternalLinkDialog); our own site and storage, and non-web schemes
// (mailto:, tel:), open straight away.
import { Linking } from "react-native";

import { APP_URL } from "./config";

export interface PendingExternal {
  url: string;
  host: string;
}

let listener: ((p: PendingExternal | null) => void) | null = null;

export function subscribeExternal(fn: (p: PendingExternal | null) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** The destination host if `url` takes the person off Akọ, otherwise null. */
export function externalHost(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  const own = [hostOf(APP_URL), hostOf(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")];
  if (own.includes(host)) return null;
  return host.replace(/^www\./, "");
}

/** Open `url`, asking first when it leaves Akọ. Resolves false if it couldn't be opened. */
export async function openExternal(url: string): Promise<boolean> {
  const host = externalHost(url);
  if (host && listener) {
    listener({ url, host });
    return true;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Called by the dialog once the person confirms. */
export function openConfirmed(url: string): Promise<void> {
  return Linking.openURL(url).catch(() => {});
}
