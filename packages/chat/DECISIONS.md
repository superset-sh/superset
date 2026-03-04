# Chat Package — Decisions & Reversible Changes

Tracking choices made during the merge that we may want to revisit.

## Removed: session-db pre-warm from EmptyChatInterface

**What:** `EmptyChatInterface` used to call `acquireSessionDB()` immediately after creating a session to pre-warm the Electric sync before the tab navigated. Removed — `useChat` now handles the full acquire/release lifecycle on mount.

**Why removed:** Keeps session-db internals encapsulated inside `useChat`. One less export from `@superset/chat/client`.

**Risk:** Slightly slower first-render on new sessions — the Electric sync starts when `useChat` mounts instead of ~200ms earlier during session creation. If users notice a flash, re-add a `prefetchSession()` helper to the client barrel.

## Removed: `SlashCommand` type from `@superset/chat` root

**What:** `SlashCommand` interface was manually defined in `src/types/` and exported from the root barrel. Removed — the type is now inferred from tRPC (`ElectronRouterOutputs["chatService"]["workspace"]["getSlashCommands"][number]`).

**Why removed:** Single source of truth — the router's return type IS the type. No manual interface to keep in sync.

**Risk:** None expected. If a non-tRPC consumer needs the type, add it back to the host barrel (it's defined locally in `slash-commands.ts`).

## Removed: `availableModels` and `slashCommands` from stream protocol

**What:** `SessionConfig` (in `useChatMetadata`) no longer carries `availableModels` or `slashCommands`. Slash commands come from tRPC query. Available models will come from the API.

**Why removed:** These are static host/platform data, not real-time session state. The stream should only carry data that changes during a session.

**Risk:** `availableModels` is currently hardcoded to `[]` in both `EmptyChatInterface` and `ActiveChatInterface`. Need to wire up an API query or tRPC endpoint when model selection is actually needed.
