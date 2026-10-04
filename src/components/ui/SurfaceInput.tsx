// src/components/ui/SurfaceInput.tsx
// The filled-style field used by the Page forms: small label above, rounded
// surface box (no underline). Single-line by default; `multiline` + `rows`
// makes a textarea. `children` renders under the box (hints, status lines).
import { forwardRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

interface SurfaceInputProps extends TextInputProps {
  label: string;
  rows?: number;
  children?: ReactNode;
}

export const SurfaceInput = forwardRef<TextInput, SurfaceInputProps>(function SurfaceInput({ label, rows, multiline, children, style, ...rest }, ref) {
  const { colors } = useTheme();
  return (
    <View>
      <Text className="mb-1 text-xs font-medium text-ink-muted">{label}</Text>
      <TextInput
        ref={ref}
        multiline={multiline || !!rows}
        textAlignVertical={multiline || rows ? "top" : "center"}
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        accessibilityLabel={label}
        className="rounded-xl bg-surface px-4 py-3 text-sm text-ink"
        style={[{ fontFamily: "Inter_400Regular" }, rows ? { minHeight: rows * 22 + 24 } : null, style]}
        {...rest}
      />
      {children}
    </View>
  );
});
