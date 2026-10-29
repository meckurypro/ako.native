// src/app/(app)/rooms/[projectId].tsx
// Old /rooms/:id links (notifications, shares) keep working: rooms are groups now.
import { Redirect, useLocalSearchParams, type Href } from "expo-router";

export default function RoomRedirect() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return <Redirect href={`/groups/${projectId}` as Href} />;
}
