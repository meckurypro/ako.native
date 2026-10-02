// src/components/ui/ErrorBoundary.tsx
import { router, type Href } from "expo-router";
import { Component, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "./Text";

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Ako crashed:", error, info);
  }

  private recover = () => {
    this.setState({ hasError: false });
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
        </View>
      );
    }
    return this.props.children;
  }
}
