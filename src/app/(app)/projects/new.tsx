// src/app/(app)/projects/new.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { CreateProject } from "@/screens/CreateProject";

export default withFullAccess(CreateProject);
