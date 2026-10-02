// src/components/ui/TextLink.tsx
// Inline tappable text (web: <Link className="text-accent …">). Nests inside a
// <Text> sentence, so "New to Akọ? <TextLink>Create an account</TextLink>" wraps naturally.
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";

import { Text } from "./Text";

interface TextLinkProps {
  /** Route to open. Omit and pass onPress for an action instead. */
  href?: string;
  onPress?: () => void;
  replace?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function TextLink({ href, onPress, replace = false, disabled, className = "text-accent font-medium", children }: TextLinkProps) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityState={{ disabled: !!disabled }}
      suppressHighlighting={false}
      className={`${className} ${disabled ? "opacity-50" : ""}`}
      onPress={() => {
        if (disabled) return;
        if (onPress) onPress();
        else if (href) (replace ? router.replace : router.push)(href as Href);
      }}
    >
      {children}
    </Text>
  );
}
