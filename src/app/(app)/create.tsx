// src/app/(app)/create.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { CreateChoice } from "@/screens/CreateChoice";

export default withFullAccess(CreateChoice);
