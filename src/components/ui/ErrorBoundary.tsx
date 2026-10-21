// src/components/ui/ErrorBoundary.tsx
import { router, type Href } from "expo-router";
import * as Updates from "expo-updates";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Text } from "./Text";

interface State {
  hasError: boolean;
  error: unknown;
  componentStack: string;
}

/** A short, screenshot-friendly description of what threw, so a crash can be diagnosed from the screen alone. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const stack = (error.stack ?? "").split("\n").slice(0, 6).join("\n");
    return `${error.name}: ${error.message}${stack ? `\n${stack}` : ""}`;
  }
  return String(error);
}

/** Which JS bundle is running (embedded in the APK, or which OTA update), to tell a stale build from a real bug. */
function bundleLabel(): string {
  try {
    if (!Updates.isEnabled) return "dev build";
    const id = Updates.updateId ? Updates.updateId.slice(0, 8) : "none";
    const when = Updates.createdAt ? Updates.createdAt.toISOString().slice(0, 16).replace("T", " ") : "unknown date";
    return `${Updates.isEmbeddedLaunch ? "embedded" : "update"} ${id} · ${when} UTC · ${Updates.channel ?? "no channel"}`;
  } catch {
    return "unknown";
  }
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null, componentStack: "" };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Ako crashed:", error, info);
    this.setState({ componentStack: (info.componentStack ?? "").trim().split("\n").slice(0, 8).join("\n") });
  }

  private recover = () => {
    this.setState({ hasError: false, error: null, componentStack: "" });
    router.replace("/feed" as Href);
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
          <Text className="font-medium text-ink">Something went wrong.</Text>
          <Pressable onPress={this.recover} accessibilityRole="button" className="rounded-full bg-accent px-5 py-2 active:bg-accent-hover">
            <Text className="text-sm font-medium text-canvas">Back to feed</Text>
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} className="max-h-64 w-full" contentContainerStyle={{ paddingVertical: 8 }}>
            <Text selectable className="text-[11px] leading-snug text-ink-muted">
              {`${describe(this.state.error)}${this.state.componentStack ? `\n\nIn:\n${this.state.componentStack}` : ""}\n\nBundle: ${bundleLabel()}`}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}
