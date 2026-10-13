// src/app/(app)/promote/[postId].tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { PromoteComposer } from "@/screens/PromoteComposer";

export default withFullAccess(PromoteComposer);
