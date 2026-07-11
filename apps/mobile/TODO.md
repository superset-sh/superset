# Mobile TODO

## Record the agent/model on chat sessions

Every chat row shows a fixed Claude mark (`screens/(authenticated)/(home)/components/ClaudeLogo/`, consumed by `home/components/SessionRow/`) because `chat_sessions` has no agent/model column (`packages/db/src/schema/schema.ts` — id/workspace/title/timestamps only). The model IS known at creation time — mobile passes `modelId` to `agents.run` / the `workspaces.create` agents sugar, and desktop does the same — it's just never persisted.

- Add a `model` (and/or `agent`) column to `chat_sessions`; write it where the host-service creates the cloud session (`packages/host-service/src/trpc/router/agents/agents.ts`).
- Electric already syncs the whole row, so mobile gets it for free once the column exists.
- Then: `SessionRow` picks the mark by provider (`ClaudeLogo` vs the OpenAI mark that already exists in `new-chat/model/components/ProviderLogo/`), and the model picker/thread screens can show per-session model too.
- Backfill: existing rows have no model — keep the Claude mark as the fallback.

## Fork a chat session

The chat-row context menu (`screens/(authenticated)/components/SessionRow/components/SessionRowMenu/`) has a "Fork" action that currently shows a "not available yet" alert. Real implementation needs:

- A fork mutation — `packages/trpc/src/router/chat/chat.ts` has `createSession`/`updateSession`/`deleteSession` but nothing that copies a session's messages into a new session. Check whether desktop has (or plans) fork semantics before inventing them here.
- Decide fork scope: copy full message history vs. fork-from-a-message; whether the fork stays in the same workspace.
- After forking, push the new thread route (`/(authenticated)/workspace/<workspaceId>/chat/<newSessionId>`).

## Fix the attachments-sheet photo carousel (SUPER-1199)

https://linear.app/superset-sh/issue/SUPER-1199 — expo-image tiles that mount while the `attachments` formSheet is presenting (or that live through a detent resize) paint at corrupted native frames and never recover. The sheet ships clean/idiomatic with this as a known bug.

- Yoga/onLayout report correct 96×96 frames the whole time; every JS-level fix was disproven (flexShrink, wrappers, inset overrides, `allowDownscaling`, explicit numeric dimensions + overflow crop).
- First lead: upgrade react-native-screens (bug found on 4.25.2; 4.26.0+ has been landing formSheet/Fabric fixes), then reproduce cold (kill app → relaunch → `superset:///attachments` deep link — fast refresh masks the bug).
- Verified stop-gaps if needed: defer mounting image tiles until the sheet's `transitionEnd` (fixes presentation, not detent drags), or single detent `[1.0]` so the sheet never resizes.
