// src/hooks/useSmartBack.ts
// Native port. Back button behaviour:
//   • Go back when there is somewhere to go.
//   • Otherwise (deep link / cold start / auth screens already replaced out of
//     the stack) land on the feed instead of exiting the app.
// The web version tracked a manual path stack to skip auth screens and to
// reload the feed; expo-router's native stack already drops auth screens on
// login (they are `replace`d) and the feed refreshes via pull-to-refresh.
import { usePathname, useRouter } from "expo-router";
import { useCallback } from "react";

export function useSmartBack() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    if (pathname === "/feed") return; // already home
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/feed");
  }, [pathname, router]);
}
