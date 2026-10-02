// src/components/ui/Button.tsx
// Port of web Button. Same variants/sizes/loading copy.
//   md (default): full-width, py-3 px-6, rounded-xl
//   sm: compact pill for inline row actions (e.g. Follow next to a list item)
import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

import { Text } from "./Text";

interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  size?: "md" | "sm";
  children?: ReactNode;
  className?: string;
}

const SIZES = {
  md: "w-full py-3 px-6 rounded-xl",
  sm: "py-1.5 px-4 rounded-full self-start",
} as const;

const TEXT_SIZES = { md: "text-base", sm: "text-sm" } as const;

// bg + pressed-state background per variant
const VARIANTS = {
  primary: { box: "bg-accent active:bg-accent-hover", text: "text-canvas" },
  secondary: { box: "bg-accent-soft active:bg-accent-soft/70", text: "text-accent" },
  ghost: { box: "bg-transparent", text: "text-ink-muted" },
} as const;

export function Button({
  variant = "primary",
  loading = false,
  size = "md",
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`items-center justify-center ${SIZES[size]} ${v.box} ${isDisabled ? "opacity-50" : ""} ${className}`}
      {...rest}
    >
      {typeof children === "string" || loading ? (
        <Text className={`font-body font-medium ${TEXT_SIZES[size]} ${v.text}`}>
          {loading ? (size === "sm" ? "…" : "Please wait…") : children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
