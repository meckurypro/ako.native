// src/app/(app)/compose.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { Compose } from "@/screens/Compose";

export default withFullAccess(Compose);
