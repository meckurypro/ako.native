// src/app/(app)/activity/offers.tsx
import { withFullAccess } from "@/components/nav/RequireFullAccess";
import { withProjectCreation } from "@/components/nav/RequireProjectCreation";
import { Offers } from "@/screens/Offers";

function OffersRoute() {
  return <Offers />;
}

export default withFullAccess(withProjectCreation(OffersRoute));
