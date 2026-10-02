// src/hooks/useTabState.ts
// Persist a screen's active tab in the route params (?tab=…) so it survives
// deep links and the OS killing/restoring the app, exactly like the web build's
// URL search param. Default tab = no param; setting uses replace semantics.
import { useLocalSearchParams, useRouter } from "expo-router";

export function useTabState<T extends string>(
  values: readonly T[],
  defaultValue: T,
  paramName: string = "tab"
): [T, (next: T) => void] {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();

  const rawParam = params[paramName];
  const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  const current = raw !== undefined && (values as readonly string[]).includes(raw) ? (raw as T) : defaultValue;

  function setTab(next: T) {
    router.setParams({ [paramName]: next === defaultValue ? undefined : next });
  }

  return [current, setTab];
}
