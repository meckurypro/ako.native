// src/components/post/PostReactionBar.tsx
// The tray under a post plus its "More actions" sheet, with the sheet's open/closed state kept HERE.
//
// Why this is its own component: the state used to live in PostCard, so tapping "more" (or long-pressing any button)
// re-rendered the entire card first — text parsing, the media carousel, embeds, ~30 hooks — before the overlay could
// even mount, which is what made it take over a second on device. Now only this small subtree renders when the sheet
// opens or closes; the rest of the card is untouched.
import { memo, useCallback, useState, type ReactNode } from "react";

import { ReactionMoreSheet } from "./ReactionMoreSheet";
import { ReactionTray, type EngagementAction } from "./ReactionTray";

interface PostReactionBarProps {
  leftActions: EngagementAction[];
  middleActions: EngagementAction[];
  /** Every engagement action, in order — listed in the "More actions" sheet. */
  moreActions: EngagementAction[];
  /** Icon for the tray's trailing "more" button. */
  moreIcon: ReactNode;
  belowLeftLabel?: { text: string; count?: number; onClick: () => void };
  /** Frozen (archived / reshare whose original is gone): tray dimmed and inert, sheet unavailable. */
  frozen: boolean;
  /** Keys the tray so a recycled list cell resets its counters instead of rolling from the previous post's. */
  postId: string;
}

function PostReactionBarImpl({ leftActions, middleActions, moreActions, moreIcon, belowLeftLabel, frozen, postId }: PostReactionBarProps) {
  const [open, setOpen] = useState(false);
  const openMore = useCallback(() => setOpen(true), []);
  const closeMore = useCallback(() => setOpen(false), []);

  const rightActions: EngagementAction[] = [{ key: "more", label: "More", icon: moreIcon, count: null, onClick: openMore }];

  return (
    <>
      <ReactionTray
        key={postId}
        leftActions={leftActions}
        middleActions={middleActions}
        rightActions={rightActions}
        onOpenMore={frozen ? undefined : openMore}
        belowLeftLabel={belowLeftLabel}
        disabled={frozen}
      />
      {open && !frozen ? <ReactionMoreSheet actions={moreActions} onClose={closeMore} /> : null}
    </>
  );
}

export const PostReactionBar = memo(PostReactionBarImpl);
