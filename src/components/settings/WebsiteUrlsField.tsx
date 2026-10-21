// src/components/settings/WebsiteUrlsField.tsx
//
// Website inputs for Settings → Profile. Everyone gets one; verified,
// unrestricted accounts can add up to MAX_WEBSITES. The database enforces the
// same rule (supabase/ako_profile_website_urls.sql) — this only decides what
// to show, so a bypassed UI still can't save extras.
import { BadgeCheck, Plus, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { haptics } from "@/lib/haptics";

export const MAX_WEBSITES = 3;

interface WebsiteUrlsFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
  /** Verified AND unrestricted — may use more than one website. */
  canAddMore: boolean;
  /** Show the "verified accounts can add up to 3" hint (unverified, unrestricted accounts). */
  showVerifiedHint?: boolean;
}

export function WebsiteUrlsField({ values, onChange, canAddMore, showVerifiedHint }: WebsiteUrlsFieldProps) {
  const rows = values.length > 0 ? values : [""];
  const max = canAddMore ? MAX_WEBSITES : 1;

  return (
    <View>
      {rows.slice(0, max).map((value, i) => (
        <View key={i} className="relative">
          <FormField
            label={i === 0 ? "Website" : `Website ${i + 1}`}
            value={value}
            onChangeText={(text) => onChange(rows.map((r, j) => (j === i ? text : r)))}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="URL"
          />
          {i > 0 ? (
            <Pressable
              onPress={() => {
                haptics.light();
                onChange(rows.filter((_, j) => j !== i));
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove website ${i + 1}`}
              hitSlop={8}
              className="absolute -top-1.5 right-0 h-8 w-8 items-center justify-center rounded-full"
            >
              <Icon as={X} size={16} className="text-ink-muted" />
            </Pressable>
          ) : null}
        </View>
      ))}

      {canAddMore && rows.length < MAX_WEBSITES ? (
        <Pressable
          onPress={() => {
            haptics.light();
            onChange([...rows, ""]);
          }}
          accessibilityRole="button"
          className="-mt-2 mb-6 flex-row items-center gap-1.5 self-start"
        >
          <Icon as={Plus} size={16} className="text-accent" />
          <Text className="text-sm font-medium text-accent">Add another website</Text>
          <Text className="text-sm text-ink-muted">
            ({rows.length}/{MAX_WEBSITES})
          </Text>
        </Pressable>
      ) : null}

      {showVerifiedHint && !canAddMore ? (
        <View className="-mt-3 mb-6 flex-row items-center gap-1.5">
          <Icon as={BadgeCheck} size={14} className="text-ink-muted" />
          <Text className="text-xs text-ink-muted">Verified accounts can add up to {MAX_WEBSITES} websites.</Text>
        </View>
      ) : null}
    </View>
  );
}
