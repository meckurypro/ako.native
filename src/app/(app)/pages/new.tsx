// src/app/(app)/pages/new.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { CreatePage } from "@/screens/CreatePage";

export default withFullAccess(CreatePage);
