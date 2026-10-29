// src/app/(app)/rooms/[projectId].tsx
// Old /rooms/:id links (notifications, shares) keep working: rooms are groups now. The query string comes along
// (a join-request notification opens the group's settings with ?settings=1).
import { Redirect, useLocalSearchParams, type Href } from "expo-router";

export default function RoomRedirect() {
  const { projectId, settings } = useLocalSearchParams<{ projectId: string; settings?: string }>();
  return <Redirect href={`/groups/${projectId}${settings ? `?settings=${settings}` : ""}` as Href} />;
}
