// src/components/page/TemplatePicker.tsx
// Where a page's editors choose the page's template: ten arrangements of the same content. Saves on tap.
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { TemplateThumb } from "@/components/page/TemplateThumb";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useUpdatePageTemplate } from "@/hooks/usePageLanding";
import { haptics } from "@/lib/haptics";
import { PAGE_TEMPLATES, getPageTemplate } from "@/lib/pageTemplates";
import type { Page } from "@/types/database";

export function TemplatePicker({ page }: { page: Page }) {
  const toast = useToast();
  const update = useUpdatePageTemplate(page.id);
  const current = getPageTemplate(page.page_template);

  return (
    <View className="gap-4">
      <View>
        <Text accessibilityRole="header" className="text-sm font-semibold text-ink">
          Page template
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted">Same content, different arrangement. Switching never changes what you've written or uploaded.</Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {PAGE_TEMPLATES.map((t) => {
          const selected = t.id === current.id;
          return (
            <Pressable
              key={t.id}
              disabled={update.isPending}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.name} template. ${t.blurb}`}
              onPress={() => {
                if (selected) return;
                haptics.selection();
                update.mutate(t.id, {
                  onSuccess: () => toast(`${t.name} template applied.`),
                  onError: () => toast("Couldn't change the template.", { variant: "error" }),
                });
              }}
              className={`rounded-2xl p-2 ${selected ? "border-2 border-accent bg-accent-soft" : "border-2 border-transparent bg-canvas"} ${update.isPending ? "opacity-60" : ""}`}
              style={{ width: "48.5%" }}
            >
              <TemplateThumb cfg={t.config} />
              <View className="mt-2 flex-row items-center gap-1.5 px-0.5">
                <Text className="text-sm font-semibold text-ink">{t.name}</Text>
                {selected ? <Icon as={Check} size={14} className="text-accent" /> : null}
              </View>
              <Text className="mt-0.5 px-0.5 text-[11px] leading-snug text-ink-muted">{t.blurb}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
