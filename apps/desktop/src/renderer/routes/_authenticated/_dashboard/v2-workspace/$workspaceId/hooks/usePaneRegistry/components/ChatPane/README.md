# ChatPane (v2 chat refactor)

This tree hosts the v2 chat pane refactor. See:

- `apps/desktop/plans/20260421-v2-chat-refactor-phased-plan.md` — the phased plan.
- `apps/desktop/plans/20260421-v2-chat-opencode-rebuild.md` — the target architecture.
- `apps/desktop/plans/20260421-v2-chat-opencode-ui-components.md` — which OpenCode UI components we're porting, and the React mappings.
- `apps/desktop/plans/20260421-chat-implementations-compared.md` — comparison of OpenCode, t3code, and the current Superset v2 chat.

## File conventions

Every non-trivial module splits into up to four files, adapted from t3code's pattern. This keeps domain logic fast to test and cheap to change.

| File | Contents | Runtime |
|---|---|---|
| `Foo.tsx` | JSX, React hooks, rendering. Imports `Foo.logic.ts` for everything non-trivial. | Browser |
| `Foo.logic.ts` | Pure functions: state reducers, row derivations, data transforms. **No React**, no side effects, no DOM. | Any |
| `Foo.logic.test.ts` | `bun:test` tests against `.logic.ts`. Runs in Node. Goal: exhaustive state coverage. | Node |
| `Foo.browser.tsx` | Browser-only variant for tests that need a real DOM (rare). Uses `happy-dom` or Playwright. | Browser |
| `Foo.test.tsx` | UI rendering tests. Uses React Testing Library. | Browser |

**Rule:** if `Foo.tsx` contains any non-trivial conditional or derivation, split it into `Foo.logic.ts`. The `.tsx` file should read like a layout template.

**Example — existing:**

- `store/chatStore.logic.ts` — pure reducers `applySessionSnapshot`, `applyStreamEvent`, `addOptimistic`, `replaceOptimistic`, `rollbackOptimistic`.
- `store/chatStore.ts` — thin Zustand wrapper that calls the reducers.
- `store/chatStore.logic.test.ts` — 16+ Node tests exercising every state transition.

## How to add a tool renderer

Per `20260421-v2-chat-opencode-ui-components.md`, every per-tool renderer plugs into a registry. Steps:

1. **Add the component.** Create `Timeline/Parts/ToolPart/tools/<Name>Tool.tsx` wrapping `BasicTool`:

   ```tsx
   import type { ToolPart } from "@superset/chat/shared";
   import { BasicTool } from "../BasicTool";
   import { getTitle, getSubtitle, getArgs } from "./<Name>Tool.logic";

   export function <Name>Tool({ part }: { part: ToolPart }) {
     return (
       <BasicTool
         icon="<icon>"
         status={statusFromToolState(part.state)}
         trigger={{
           title: getTitle(part),
           subtitle: getSubtitle(part),
           args: getArgs(part),
         }}
       >
         {/* tool-specific content */}
       </BasicTool>
     );
   }
   ```

2. **Add the logic file.** `<Name>Tool.logic.ts` with pure derivations:

   ```ts
   export function getTitle(part: ToolPart): string { ... }
   export function getSubtitle(part: ToolPart): string | undefined { ... }
   export function getArgs(part: ToolPart): string[] { ... }
   ```

3. **Add tests.** `<Name>Tool.logic.test.ts` covering every `part.state.kind` (`input-streaming` | `running` | `completed` | `error`).

4. **Register.** Add one line to `Timeline/Parts/ToolPart/toolRegistry.ts`:

   ```ts
   export const TOOL_REGISTRY = {
     // ...
     "<tool-name>": <Name>Tool,
   };
   ```

5. **Done.** The dispatcher in `ToolPart.tsx` will route `part.tool === "<tool-name>"` to your component.

The `GenericTool` fallback renders any tool not in the registry. Keep it as the last entry.

## Flag

The refactor is gated by the `CHAT_V2_OPENCODE_REBUILD` flag in `renderer/stores/chat-preferences`. Default off. Entry shim in `ChatPane.tsx` routes to the new `ChatSurface` when on; legacy `WorkspaceChatInterface` when off.

## Things this tree owns

- Pane registry integration (ChatPane.tsx — small).
- `store/` — new Zustand store + pure reducers.
- `components/ChatSurface/` (coming Phase 2+) — Timeline, Docks, Composer.
- `components/SessionSelector/` — keeps today's implementation.

## Things this tree does NOT own

- LLM runtime (host-service owns it — see `plans/host-service-chat-architecture.md`).
- Provider credentials (shared provider/settings layer per host-service plan).
- Session record CRUD (cloud `chat_sessions` table; fetched via tRPC).

## When to touch what

| Task | File |
|---|---|
| Add a tool renderer | `Timeline/Parts/ToolPart/tools/` (see above) |
| Change how messages are grouped into turns | `store/selectors.ts` (Phase 2) |
| Fix a streaming-delta bug | `store/chatStore.logic.ts` — `applyStreamEvent` |
| Tweak approval UX | `Docks/PermissionDock.tsx` (Phase 4) |
| Change composer submit payload | `Composer/utils/buildRequestParts.ts` (Phase 5) |
| Add a slash command type | `packages/chat/src/shared/` + `Composer/Editor/slashPopover.ts` |
