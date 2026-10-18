// src/components/nav/RequireProjectCreation.tsx
// Native counterpart of web RequireProjectCreation. Unrestricted accounts pass
// straight through. A restricted (consumer-only) account is let into the project
// form only when an admin has allowed restricted accounts to create at least one
// project type; otherwise it is silently redirected home, like every other
// creation surface.
import { Redirect, type Href } from "expo-router";
import type { ComponentType } from "react";

import { RESTRICTED_HOME, useIsRestricted } from "@/hooks/useAccountAccess";
import { useCanCreateAnyProject } from "@/hooks/useCreatorKinds";

export function withProjectCreation<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function ProjectCreationOnly(props: P) {
    const restricted = useIsRestricted();
    const canCreate = useCanCreateAnyProject();
    if (restricted && !canCreate) return <Redirect href={RESTRICTED_HOME as Href} />;
    return <Screen {...props} />;
  }
  ProjectCreationOnly.displayName = `withProjectCreation(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return ProjectCreationOnly;
}
