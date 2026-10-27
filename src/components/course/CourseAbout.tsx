// src/components/course/CourseAbout.tsx
// "What you'll learn", requirements and who it's for: the standard course-page summary.
import { Check } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { CourseDetails } from "@/hooks/useCourseBuilder";
import { COURSE_LEVELS } from "@/lib/courseTypes";

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text className="mb-1.5 font-display text-lg font-bold text-ink">{title}</Text>
      <View className="gap-1.5">
        {items.map((o, i) => (
          <View key={i} className="flex-row items-start gap-2">
            <Text className="text-sm text-ink-muted">•</Text>
            <Text className="min-w-0 flex-1 text-sm text-ink">{o}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CourseAbout({ details, lessons, minutes }: { details: CourseDetails | null | undefined; lessons: number; minutes: number }) {
  if (!details) return null;
  const level = COURSE_LEVELS.find((l) => l.value === details.level)?.label;
  const meta = [
    level,
    details.language,
    lessons > 0 ? `${lessons} lesson${lessons === 1 ? "" : "s"}` : null,
    minutes > 0 ? (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasAny = details.subtitle || details.objectives.length || details.requirements.length || details.audience.length;
  if (!hasAny) return null;

  return (
    <View className="mb-5 gap-4 rounded-2xl border border-border bg-surface p-4">
      {details.subtitle ? <Text className="text-[15px] text-ink">{details.subtitle}</Text> : null}
      {meta ? <Text className="-mt-2 text-xs text-ink-muted">{meta}</Text> : null}
      {details.objectives.length > 0 && (
        <View>
          <Text className="mb-2 font-display text-lg font-bold text-ink">What you'll learn</Text>
          <View className="gap-1.5">
            {details.objectives.map((o, i) => (
              <View key={i} className="flex-row items-start gap-2">
                <View className="mt-0.5">
                  <Icon as={Check} size={15} className="text-accent" />
                </View>
                <Text className="min-w-0 flex-1 text-sm text-ink">{o}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <Bullets title="Before you start" items={details.requirements} />
      <Bullets title="Who it's for" items={details.audience} />
    </View>
  );
}
