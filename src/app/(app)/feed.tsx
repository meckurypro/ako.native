// src/app/(app)/feed.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { Feed } from "@/screens/Feed";

export default withFullAccess(Feed);
