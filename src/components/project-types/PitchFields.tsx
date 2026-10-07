// src/components/project-types/PitchFields.tsx
import { View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { Text } from "@/components/ui/Text";

export interface PitchFieldsValue {
  goal_amount_usd: string; // kept as text for the input, parsed on submit
}

export const EMPTY_PITCH_FIELDS: PitchFieldsValue = { goal_amount_usd: "" };

export function PitchFields({ value, onChange }: { value: PitchFieldsValue; onChange: (value: PitchFieldsValue) => void }) {
  return (
    <View className="mb-4">
      <FormField label="Fundraising goal (USD)" value={value.goal_amount_usd} onChangeText={(goal_amount_usd) => onChange({ goal_amount_usd })} keyboardType="decimal-pad" placeholder="5000" />
      <Text className="-mt-4 mb-2 text-xs text-ink-muted">
        Shown as a progress bar only. Supporters can back this idea for any amount they choose — you keep whatever is raised, whether or not you hit this goal.
      </Text>
    </View>
  );
}
