// src/components/page/PageTeamShowcase.tsx
// "Meet the team" — the landing-page section showing ONLY the members a page admin chose to feature:
// avatar, name, role and a short bio, like a website's team section. It never shows how many people are on
// the team, and renders nothing when no one is featured. (Mirrors the web component of the same name.)
import { router, type Href } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import type { PageMemberWithProfile } from "@/types/database";

export function PageTeamShowcase({ members, onTouchLock }: { members: PageMemberWithProfile[]; onTouchLock?: (locked: boolean) => void }) {
  if (members.length === 0) return null;

  return (
    <View accessibilityRole="summary">
      <Text accessibilityRole="header" className="font-display text-xl font-semibold tracking-tight text-ink">
        Meet the team
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        snapToInterval={252}
        decelerationRate="fast"
        onTouchStart={() => onTouchLock?.(true)}
        onTouchEnd={() => onTouchLock?.(false)}
        onTouchCancel={() => onTouchLock?.(false)}
        className="-mx-4 mt-4"
        contentContainerClassName="gap-3 px-4 pb-1"
      >
        {members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/profile/${m.profile.username}` as Href)}
            accessibilityRole="link"
            accessibilityLabel={`${m.profile.display_name}, ${m.role_label}`}
            className="rounded-2xl border border-border bg-surface p-4 active:opacity-80"
            style={{ width: 240 }}
          >
            <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="lg" />
            <Text numberOfLines={1} className="mt-3 text-base font-semibold text-ink">
              {m.profile.display_name}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs font-medium uppercase tracking-wide text-accent">
              {m.role_label}
            </Text>
            {m.profile.bio ? (
              <Text numberOfLines={4} className="mt-2 text-sm leading-relaxed text-ink-muted">
                {m.profile.bio}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
