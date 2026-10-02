// src/components/ui/OtpInput.tsx
// 8-digit OTP entry — matches Supabase's email OTP length for this project
// (Dashboard → Auth → Emails). If the project's OTP length differs, change the
// `length` default or verifyOtp will always get an incomplete code.
//
// Handles what the web build handled with onPaste, plus native extras: a code
// pasted/autofilled into ANY box (iOS "From Messages/Mail" suggestions, Android
// SMS autofill, long-press paste) fans out across all boxes.
import { useRef, useState } from "react";
import { TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  error?: string;
}

export function OtpInput({ length = 8, onComplete, error }: OtpInputProps) {
  const { colors } = useTheme();
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  function commit(next: string[], focusIndex: number) {
    setDigits(next);
    inputRefs.current[Math.min(focusIndex, length - 1)]?.focus();
    if (next.every((d) => d !== "")) onComplete(next.join(""));
  }

  function handleChange(index: number, raw: string) {
    const numeric = raw.replace(/[^0-9]/g, "");

    // Multi-character input = paste or OS autofill: spread it from the first box.
    if (numeric.length > 1) {
      const next = Array(length).fill("");
      for (let i = 0; i < Math.min(numeric.length, length); i++) next[i] = numeric[i];
      commit(next, numeric.length);
      return;
    }

    const next = [...digits];
    next[index] = numeric.slice(-1);
    setDigits(next);
    if (numeric && index < length - 1) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) onComplete(next.join(""));
  }

  function handleKeyPress(index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <View>
      <View className="flex-row justify-center gap-2">
        {digits.map((digit, i) => (
          <View key={i}>
            {focusedIndex === i && !error ? (
              <View
                pointerEvents="none"
                className="absolute -inset-[2px] rounded-[10px] border-2 border-accent/40"
              />
            ) : null}
            <TextInput
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              value={digit}
              onChangeText={(v) => handleChange(i, v)}
              onKeyPress={(e) => handleKeyPress(i, e)}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex((cur) => (cur === i ? null : cur))}
              keyboardType="number-pad"
              inputMode="numeric"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              selectTextOnFocus
              selectionColor={colors.accent}
              accessibilityLabel={`Digit ${i + 1} of ${length}`}
              className={`h-12 w-10 rounded-lg border bg-canvas text-center text-lg font-medium text-ink ${
                error ? "border-danger" : focusedIndex === i ? "border-accent" : "border-border"
              }`}
              style={{ fontFamily: "Inter_500Medium" }}
            />
          </View>
        ))}
      </View>
      {error ? <Text className="mt-3 text-center text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
