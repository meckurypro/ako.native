// src/components/ui/PasswordField.tsx
import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, type TextInput } from "react-native";

import { FormField, type FormFieldProps } from "./FormField";
import { Icon } from "./styled";

export const PasswordField = forwardRef<TextInput, Omit<FormFieldProps, "secureTextEntry" | "trailing">>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <FormField
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        {...props}
        secureTextEntry={!visible}
        trailing={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            className="pb-3 pl-2"
          >
            <Icon as={visible ? EyeOff : Eye} size={17} className="text-ink-muted" />
          </Pressable>
        }
      />
    );
  }
);
