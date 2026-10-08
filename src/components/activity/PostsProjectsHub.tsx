// src/components/activity/PostsProjectsHub.tsx
// Two-tab hub (Posts | Projects) shared by Saved and Liked. The indicator follows the swipe on the
// UI thread; each pane scrolls itself.
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { PostCard } from "@/components/post/PostCard";
import { PostList } from "@/components/post/PostList";
import { ProjectList } from "@/components/project/ProjectList";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Text } from "@/components/ui/Text";
import { useTabState } from "@/hooks/useTabState";
import type { PostWithAuthor } from "@/types/database";
import type { Project } from "@/hooks/useProjects";
import { haptics } from "@/lib/haptics";

const TABS = ["posts", "projects"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { posts: "Posts", projects: "Projects" };

interface PostsProjectsHubProps {
  title: string;
  posts: PostWithAuthor[] | undefined;
  postsLoading: boolean;
  postsEmpty: string;
  projects: Project[] | undefined;
  projectsLoading: boolean;
  projectsEmpty: string;
}

export function PostsProjectsHub({ title, posts, postsLoading, postsEmpty, projects, projectsLoading, projectsEmpty }: PostsProjectsHubProps) {
  const [tab, setTab] = useTabState<Tab>(TABS, "posts");
  const activeIndex = TABS.indexOf(tab);
  const progress = useSharedValue(activeIndex);
  const [barWidth, setBarWidth] = useState(0);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * (barWidth / TABS.length) }] }));

  const postList = posts ?? [];

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={title} />
      <View className="px-4">
        <View className="relative flex-row items-stretch border-b border-border" onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
          {TABS.map((key, i) => (
            <Pressable
              key={key}
              onPress={() => {
                if (i === activeIndex) return;
                haptics.selection();
                setTab(key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              className="flex-1 items-center pb-3 pt-1"
            >
              <Text className={`text-sm font-medium ${tab === key ? "text-accent" : "text-ink-muted"}`}>{LABELS[key]}</Text>
            </Pressable>
          ))}
          <Animated.View className="absolute bottom-0 left-0 h-[2px] rounded-full bg-accent" style={[{ width: barWidth / TABS.length }, indicatorStyle]} />
        </View>
      </View>

      <View className="flex-1">
        <SwipeableTabs
          index={activeIndex}
          progress={progress}
          onIndexChange={(i) => {
            haptics.selection();
            setTab(TABS[i]);
          }}
        >
          <PostList
            key="posts"
            posts={postList}
            isLoading={postsLoading}
            underTopBar={false}
            renderPost={(post, { visible }) => <PostCard post={post} active={activeIndex === 0} visible={visible && activeIndex === 0} />}
            emptyState={!postsLoading && postList.length === 0 ? <Text className="px-4 py-10 text-center text-sm text-ink-muted">{postsEmpty}</Text> : null}
          />
          <ProjectList key="projects" projects={projects} isLoading={projectsLoading} emptyMessage={projectsEmpty} />
        </SwipeableTabs>
      </View>
    </View>
  );
}
