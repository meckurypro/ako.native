// src/app/(app)/post/[postId]/edit.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { EditPost } from "@/screens/EditPost";

export default withFullAccess(EditPost);
