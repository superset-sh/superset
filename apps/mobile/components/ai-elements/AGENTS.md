# Chat scroll discipline (conversation.tsx)

`Conversation` implements the ChatGPT/Claude-mobile scroll feel on top of
LegendList. The behaviors below are **product invariants** — hard-won against
real device behavior. Before "simplifying" any of them, run the regression
suite and keep it green:

```bash
# signed-in dev-client simulator
maestro test .maestro/flows/conversation-lab.yml
```

The suite drives `screens/(authenticated)/debug/conversation-lab` (deep link
`superset://debug/conversation-lab`), which runs scripted
stream/dip/overlay/send-anchor interactions against the REAL component and
self-asserts each invariant.

## Invariants

1. **The list moves only when the user asks.** A drag-begin kills any
   programmatic following instantly. Streaming content, tool output, the
   permission stack appearing/resolving, the keyboard hiding, and content
   re-measurement must never shift what an unpinned reader is looking at —
   not by one point.
2. **Re-pinning is explicit.** Follow-to-bottom re-arms only when a USER
   gesture comes to rest at the true end of content, or via the
   scroll-to-bottom button. Programmatic scrolls also emit momentum-end
   events — they must never re-pin (`gestureRef`).
3. **Send anchors to the top.** Sending a message scrolls it to
   `anchorOffsetTop` below the viewport top with whitespace beneath for the
   reply. Follow stays OFF afterwards.
4. **Pinned viewport shrink keeps the newest content visible** (keyboard up,
   permission card in). Viewport growth never moves content; if it would
   re-glue the bottom (shifting the chat down), we unpin instead and let the
   stream consume the freed space in place.

## Load-bearing implementation facts

- **Never use LegendList's estimate-based motion**: `scrollToEnd`,
  `scrollToIndex`, `positionAtIndex`-derived targets, `initialScrollAtEnd`,
  and `maintainScrollAtEnd` all compute against the list's ESTIMATED total
  size. Estimates can be thousands of points off after replay/remount, iOS
  `setContentOffset` does not clamp, and the view parks in blank space (or
  re-arms internal end-chasing on later data changes). Only
  `scrollToOffset` with targets derived from the NATIVE content height
  (`onContentSizeChange`) is allowed. Initial positioning falls out of the
  pinned follow (pinned starts true).
- **The trailing spacer is `contentInset.bottom`, never a spacer view.**
  Content-size and child-layout events arrive out of phase; deriving
  "content minus spacer view" from them oscillates violently (the lab's
  followPin scenario caught a 5000pt feedback loop). Insets change no
  content sizes and emit no layout events. iOS-only is fine: mobile is
  iOS-only by repo policy.
- **The banked inset must exist BEFORE the event that needs it.** iOS clamps
  the offset in the same frame the content shrinks or the viewport grows —
  reacting afterwards is one frame too late and the view yanks. Hence
  `syncSpacer` sizes the inset against the LARGEST viewport seen
  (`maxViewportHRef`, covers overlays/keyboard leaving) plus `SPACER_SLACK`
  (covers transient streaming re-measure dips, observed ~40pt).
- **Spacer updates ride content/layout events only, never scroll events** —
  coupling them to scroll feeds iOS bounce back into the content size.
- **Anchor targets are computed bottom-relative and re-checked at settle.**
  `contentH − paddingBottom − footerH − tail(measured) − anchorOffsetTop`.
  The native contentH still contains estimates for unmounted items between a
  far-up reader and the end, so the settle handler recomputes and runs up to
  `ANCHOR_SETTLE_MAX_ROUNDS` corrective legs, then snaps the last
  ≤`ANCHOR_SNAP_TOLERANCE` points non-animated.
- **`maintainVisibleContentPosition` stays on** for backward pagination
  (older pages prepend without shifting the viewport).

## Known simplification candidate

LegendList 3.x ships `anchoredEndSpace` ("keeps an item visually anchored to
the start by adding trailing space") — a partial built-in for invariant 3.
A scoped review concluded it is NOT a wholesale replacement: it could
replace the tail-measurement retries (it forces the anchor-through-tail
range into alwaysRender), but it cannot eliminate the estimated-height error
over unmounted history, so the corrective settle legs stay; and its inset
changes can clamp the offset, so it must compose with the banked inset and
be disabled synchronously on drag. Adopt incrementally, lab suite green.
