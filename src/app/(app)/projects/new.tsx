// src/app/(app)/projects/new.tsx
import { withProjectCreation } from "@/components/nav/RequireProjectCreation";
import { CreateProject } from "@/screens/CreateProject";

export default withProjectCreation(CreateProject);
