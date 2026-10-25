// src/components/course/CoursePromo.tsx
// The course trailer for anyone deciding whether to buy: the creator's promo video (upload or link).
import { View } from "react-native";

import { LessonMedia, UploadedVideo } from "@/components/project/LessonMedia";
import { useCourseDetails } from "@/hooks/useCourseBuilder";

export function CoursePromo({ projectId }: { projectId: string | undefined }) {
  const { data: details } = useCourseDetails(projectId);
  if (!details || (!details.promo_video_path && !details.promo_url)) return null;
  return (
    <View className="mb-3">
      {details.promo_video_path ? (
        <UploadedVideo path={details.promo_video_path} width={details.promo_width} height={details.promo_height} onWatched={() => {}} />
      ) : (
        <LessonMedia url={details.promo_url as string} onWatched={() => {}} />
      )}
    </View>
  );
}
