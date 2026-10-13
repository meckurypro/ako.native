// src/app/(app)/activity/scheduled.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { ScheduledPosts } from "@/screens/ScheduledPosts";

function ScheduledPostsRoute() {
  return <ScheduledPosts />;
}

export default withFullAccess(ScheduledPostsRoute);
