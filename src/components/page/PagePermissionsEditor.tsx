// src/components/page/PagePermissionsEditor.tsx
// Checklist of what a (non-admin) team member may do as the page. Used when
// inviting someone and when editing an existing member — see lib/pagePermissions
// for the keys and what the server enforces.
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { PAGE_PERMISSION_META, type PagePermissions } from "@/lib/pagePermissions";

interface Props {
  value: PagePermissions;
  onChange: (next: PagePermissions) => void;
  disabled?: boolean;
}

export function PagePermissionsEditor({ value, onChange, disabled }: Props) {
  return (
    <View className="gap-2.5">
      {PAGE_PERMISSION_META.map(({ key, label, description }) => (
        <Pressable
          key={key}
          onPress={() => onChange({ ...value, [key]: !value[key] })}
          disabled={disabled}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value[key], disabled: !!disabled }}
          className={`flex-row items-start gap-2.5 ${disabled ? "opacity-50" : ""}`}
        >
          <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${value[key] ? "border-accent bg-accent" : "border-border bg-canvas"}`}>
            {value[key] ? <Icon as={Check} size={13} strokeWidth={3} className="text-canvas" /> : null}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm text-ink">{label}</Text>
            <Text className="text-xs text-ink-muted">{description}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
