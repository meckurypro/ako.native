// src/screens/FeedAccess.tsx
//
// "Progressive Access" — what it takes to earn the Feed, by what the person came to Akọ to do.
// Pathways are alternatives (any ONE unlocks); the conditions inside a pathway follow that
// pathway's AND / OR. Everything shown is computed by the database.
import { Check } from "lucide-react-native";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, type Href } from "expo-router";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  closestPathway,
  PATHWAY_LABELS,
  useMyFeedAccess,
  type FeedCondition,
  type FeedPathwayState,
} from "@/hooks/useFeedAccess";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ConditionRow({ c, logic }: { c: FeedCondition; logic: "AND" | "OR" }) {
  const pct = c.required > 0 ? Math.min(100, Math.round((c.current / c.required) * 100)) : c.met ? 100 : 0;
  return (
    <View className="mt-2.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-ink-muted">
          {logic === "OR" ? "Either: " : ""}
          {c.label}
        </Text>
        <Text className={`text-xs ${c.met ? "font-medium text-brand-orange" : "text-ink-muted"}`}>
          {fmt(Math.min(c.current, c.required))} / {fmt(c.required)}
        </Text>
      </View>
      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
        <View className="h-full rounded-full bg-brand-orange" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

function PathwayCard({ rule }: { rule: FeedPathwayState }) {
  return (
    <View className={`mb-3 rounded-2xl border bg-surface p-4 ${rule.met ? "border-brand-orange" : "border-border"}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-ink">{rule.name}</Text>
          {rule.description ? <Text className="mt-0.5 text-sm text-ink-muted">{rule.description}</Text> : null}
        </View>
        {rule.met ? <Icon as={Check} size={18} className="mt-0.5 text-brand-orange" /> : null}
      </View>
      {rule.conditions.map((c) => (
        <ConditionRow key={c.metric + c.op + c.required} c={c} logic={rule.logic} />
      ))}
    </View>
  );
}

export function FeedAccess() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError } = useMyFeedAccess();

  const grouped = new Map<string, FeedPathwayState[]>();
  for (const r of data?.rules ?? []) grouped.set(r.pathway, [...(grouped.get(r.pathway) ?? []), r]);
  const next = data && !data.has_feed_access ? closestPathway(data.rules) : null;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Feed access" bar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {isLoading ? <ActivityIndicator className="mt-16" /> : null}
        {isError ? <Text className="mt-10 text-center text-sm text-ink-muted">Couldn't load this right now.</Text> : null}

        {data?.has_feed_access ? (
          <View className="rounded-2xl border border-border bg-surface p-4">
            <Text className="font-medium text-ink">The Feed is open to you</Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {data.unlocked_by?.startsWith("rule:")
                ? "You earned it through your activity on Akọ."
                : "Your account has full access."}
            </Text>
            <Link href={"/feed" as Href} className="mt-3 text-sm font-medium text-brand-orange">
              Go to the Feed
            </Link>
          </View>
        ) : null}

        {data && !data.has_feed_access ? (
          <>
            <Text className="mb-5 text-sm text-ink-muted">
              The Feed opens as you take part. Pick whichever path fits why you're here — completing any one of them
              unlocks it.
            </Text>
            {next && next.progress > 0 ? (
              <Text className="mb-5 text-sm text-ink">
                You're closest on <Text className="text-sm font-medium text-ink">{next.name}</Text> —{" "}
                {Math.round(next.progress * 100)}% there.
              </Text>
            ) : null}
            {data.auto_unlock_blocked ? (
              <Text className="mb-5 text-sm text-ink-muted">
                Your access is being reviewed by the Akọ team, so it won't unlock automatically.
              </Text>
            ) : null}
            {!data.progressive_enabled && !data.auto_unlock_blocked ? (
              <Text className="mb-5 text-sm text-ink-muted">Automatic unlocking is paused right now.</Text>
            ) : null}

            {[...grouped.entries()].map(([pathway, rules]) => (
              <View key={pathway} className="mb-3">
                <Text className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  {PATHWAY_LABELS[pathway] ?? pathway}
                </Text>
                {rules.map((r) => (
                  <PathwayCard key={r.key} rule={r} />
                ))}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
