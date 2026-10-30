// src/app/(app)/groups/new.tsx
// Start a group. The project form in group mode: no type picker, a community/cohort choice instead.
// Only verified, unrestricted accounts (and admins) get here; everyone else is sent back.
import { Redirect, type Href } from "expo-router";

import { withProjectCreation } from "@/components/nav/RequireProjectCreation";
import { useCanCreateGroup } from "@/hooks/useCanCreateGroup";
import { CreateProject } from "@/screens/CreateProject";

function NewGroup() {
  const { allowed, loading } = useCanCreateGroup();
  if (loading) return null;
  if (!allowed) return <Redirect href={"/connect" as Href} />;
  return <CreateProject fixedType="room" />;
}

export default withProjectCreation(NewGroup);
