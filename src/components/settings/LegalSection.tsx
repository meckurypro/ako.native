// src/components/settings/LegalSection.tsx
// Legal: links to the Privacy Policy and Terms of Service screens.
import { router, type Href } from "expo-router";
import { ChevronRight, FileText } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy", description: "What we collect, why, and your choices" },
  { href: "/terms", label: "Terms of Service", description: "The rules for using Akọ" },
];

export function LegalSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <SettingsSection icon={<Icon as={FileText} size={18} className="text-ink-muted" />} title="Legal" open={open} onToggle={onToggle}>
      <View className="mt-3 overflow-hidden rounded-xl border border-border">
        {LEGAL_LINKS.map((item, i) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href as Href)}
            accessibilityRole="link"
            className={`flex-row items-center gap-3 bg-canvas p-4 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-ink">{item.label}</Text>
              <Text className="text-xs text-ink-muted">{item.description}</Text>
            </View>
            <Icon as={ChevronRight} size={18} className="text-ink-muted" />
          </Pressable>
        ))}
      </View>
    </SettingsSection>
  );
}
