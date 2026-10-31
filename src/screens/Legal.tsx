// src/screens/Legal.tsx
// Privacy Policy (/privacy) and Terms of Service (/terms). The routes live in the (auth) group, which has no auth
// guard, so the same screens open from sign-up / log-in (signed out) and from Settings > Legal (signed in).
import { router, type Href } from "expo-router";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from "@/lib/legalContent";

function LegalScreen({ doc, otherPath, otherLabel }: { doc: LegalDocument; otherPath: string; otherLabel: string }) {
  const insets = useSafeAreaInsets();

  // Back to wherever the person came from; opened cold (a link from outside the app) there's nothing behind us, so
  // land on the entry route, which sends signed-in people to the feed and everyone else to log in.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={doc.title} bar onBack={goBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: insets.bottom + 48 }}>
        <Text className="mb-4 text-xs text-ink-muted">Last updated {LEGAL_UPDATED}</Text>
        <Text className="mb-8 text-[15px] leading-relaxed text-ink">{doc.intro}</Text>

        {doc.sections.map((section, i) => (
          <View key={section.id} className="mb-8">
            <Text accessibilityRole="header" className="mb-3 font-display text-lg text-ink">
              {i + 1}. {section.title}
            </Text>
            {section.blocks.map((block, bi) =>
              Array.isArray(block) ? (
                <View key={bi} className="mb-3 gap-2">
                  {block.map((item, ii) => (
                    <View key={ii} className="flex-row gap-2.5 pr-1">
                      <Text className="text-[15px] leading-relaxed text-ink-muted">•</Text>
                      <Text className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink">{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text key={bi} className="mb-3 text-[15px] leading-relaxed text-ink">
                  {block}
                </Text>
              ),
            )}
          </View>
        ))}

        <View className="gap-3 border-t border-border pt-6">
          <Text className="text-sm text-ink-muted">
            Questions? Email{" "}
            <Text accessibilityRole="link" className="text-accent" onPress={() => void Linking.openURL(`mailto:${LEGAL_CONTACT_EMAIL}`)}>
              {LEGAL_CONTACT_EMAIL}
            </Text>
            .
          </Text>
          <Pressable onPress={() => router.replace(otherPath as Href)} accessibilityRole="link" hitSlop={8}>
            <Text className="text-sm font-medium text-accent">{otherLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export function PrivacyPolicy() {
  return <LegalScreen doc={PRIVACY_POLICY} otherPath="/terms" otherLabel="Read our Terms of Service" />;
}

export function TermsOfService() {
  return <LegalScreen doc={TERMS_OF_SERVICE} otherPath="/privacy" otherLabel="Read our Privacy Policy" />;
}
