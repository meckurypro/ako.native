// src/app/(app)/activity/drafts.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { DraftPosts } from "@/screens/DraftPosts";

function DraftPostsRoute() {
  return <DraftPosts />;
}

export default withFullAccess(DraftPostsRoute);
