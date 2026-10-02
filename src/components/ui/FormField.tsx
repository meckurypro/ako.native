// src/components/ui/FormField.tsx
// Underlined input with an uppercase micro-label — the app's signature form
// style. The underline turns accent on focus and danger on error.
import { forwardRef, useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

export interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  /** Rendered inside the input row, right-aligned (PasswordField's eye toggle). */
  trailing?: React.ReactNode;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, error, trailing, onFocus, onBlur, style, ...inputProps },
  ref
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const underline = error ? "border-danger" : focused ? "border-accent" : "border-ink-muted/20";

  return (
    <View className="mb-6">
      <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">{label}</Text>
      <View className={`flex-row items-center border-b-2 ${underline}`}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={`${colors.inkMuted}73`} // ink-muted @ 45%
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="flex-1 px-0 pb-3 pt-1 text-base text-ink"
          style={[{ fontFamily: "Inter_400Regular" }, style]}
          {...inputProps}
        />
        {trailing}
      </View>
      {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}
    </View>
  );
});
