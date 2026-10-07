// src/components/project-types/UrlFields.tsx
import { View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { Text } from "@/components/ui/Text";

export interface UrlFieldsValue {
  url: string;
}

export const EMPTY_URL_FIELDS: UrlFieldsValue = { url: "" };

export function UrlFields({ value, onChange }: { value: UrlFieldsValue; onChange: (value: UrlFieldsValue) => void }) {
  return (
    <View>
      <FormField
        label="Link"
        value={value.url}
        onChangeText={(url) => onChange({ url })}
        placeholder="https://chat.whatsapp.com/..."
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text className="-mt-3 mb-4 text-xs text-ink-muted">
        Whatever you're sharing access to — a WhatsApp group, a web page, anything with a link. Buyers see this once they unlock it.
      </Text>
    </View>
  );
}
