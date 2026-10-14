// src/app/(app)/activity/events.tsx
// Events, meetings and rooms moved to the Connect tab.
import { Redirect, type Href } from "expo-router";

export default function EventsRedirectRoute() {
  return <Redirect href={"/connect" as Href} />;
}
