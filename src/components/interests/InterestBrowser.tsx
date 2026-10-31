// src/components/interests/InterestBrowser.tsx
// Browse and pick tags (interests): domain pills across the top, then each category's tags as chips. Used by
// onboarding (under its search field) and by Settings → Interests. A search box is optional — it matches tag
// names and their aliases, so "chatgpt" finds Generative AI.
import { Check, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useCategories, type CategoryWithInterests } from "@/hooks/useCategories";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

interface DomainGroup {
  key: string;
  name: string;
  order: number;
  categories: CategoryWithInterests[];
}

export function matchesInterest(interest: { name: string; aliases?: string[] }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return interest.name.toLowerCase().includes(needle) || (interest.aliases ?? []).some((a) => a.includes(needle));
}

export function InterestBrowser({
  selected,
  onToggle,
  showSearch = true,
}: {
  selected: Set<string>;
  onToggle: (interestId: string) => void;
  showSearch?: boolean;
}) {
  const { colors } = useTheme();
  const { data: categories, isLoading, error } = useCategories();
  const [domainKey, setDomainKey] = useState<string>("all");
  const [query, setQuery] = useState("");

  const domains = useMemo<DomainGroup[]>(() => {
    const byKey = new Map<string, DomainGroup>();
    for (const c of categories ?? []) {
      if (c.interests.length === 0) continue;
      const key = c.domain?.slug ?? "more";
      const group = byKey.get(key) ?? { key, name: c.domain?.name ?? "More", order: c.domain?.sort_order ?? 99, categories: [] };
      group.categories.push(c);
      byKey.set(key, group);
    }
    return [...byKey.values()].sort((a, b) => a.order - b.order);
  }, [categories]);

  if (isLoading) return <Text className="py-4 text-sm text-ink-muted">Loading topics…</Text>;
  if (error) return <Text className="py-4 text-sm text-danger">Couldn't load topics. Check your connection and try again.</Text>;

  const searching = query.trim().length > 0;
  const visible = domainKey === "all" ? domains : domains.filter((d) => d.key === domainKey);

  const chip = (id: string, name: string) => {
    const on = selected.has(id);
    return (
      <Pressable
        key={id}
        onPress={() => {
          haptics.selection();
          onToggle(id);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${on ? "border-cta bg-cta" : "border-border bg-surface active:border-accent-a50"}`}
      >
        {on ? <Icon as={Check} size={13} className="text-white" /> : null}
        <Text className={`text-sm ${on ? "text-white" : "text-ink"}`}>{name}</Text>
      </Pressable>
    );
  };

  return (
    <View>
      {showSearch ? (
        <View className="mb-3 h-10 flex-row items-center gap-2 rounded-full border border-border bg-surface px-3.5">
          <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search topics — Music, Startups, Fitness…"
            placeholderTextColor={`${colors.inkMuted}99`}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search topics"
            className="min-w-0 flex-1 py-0 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
      ) : null}

      {searching ? (
        <View className="flex-row flex-wrap gap-2">
          {(categories ?? [])
            .flatMap((c) => c.interests.filter((i) => matchesInterest(i, query)))
            .slice(0, 40)
            .map((i) => chip(i.id, i.name))}
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mb-4" contentContainerStyle={{ gap: 6 }}>
            {[{ key: "all", name: "All" }, ...domains].map((d) => (
              <Pressable
                key={d.key}
                onPress={() => {
                  haptics.selection();
                  setDomainKey(d.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: domainKey === d.key }}
                className={`rounded-full px-3 py-1.5 ${domainKey === d.key ? "bg-ink" : "bg-surface"}`}
              >
                <Text className={`text-xs font-medium ${domainKey === d.key ? "text-canvas" : "text-ink-muted"}`}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View className="gap-5">
            {visible.flatMap((d) =>
              d.categories.map((c) => (
                <View key={c.id}>
                  <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{c.name}</Text>
                  <View className="flex-row flex-wrap gap-2">{c.interests.map((i) => chip(i.id, i.name))}</View>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}
