// src/app/(app)/groups/new.tsx
// Start a group. The project form in group mode: no type picker, a community/cohort choice instead.
import { withProjectCreation } from "@/components/nav/RequireProjectCreation";
import { CreateProject } from "@/screens/CreateProject";

function NewGroup() {
  return <CreateProject fixedType="room" />;
}

export default withProjectCreation(NewGroup);
