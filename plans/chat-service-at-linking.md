# Re-implement @ Linking + Chat Service (SUPER-288)

## Context

The old chat had @ linking for files, removed during the durable stream rewrite. The current `FileMentionPopover` exists but doesn't work — `useFileSearch` depends on `electronTrpc.filesystem.searchFiles`, which is desktop-only.

Chat needs workspace-level features requiring local filesystem access (file search, slash commands). These can't live in `apps/api` — they need a process where the files are (desktop or sandbox). Meanwhile, agent execution (`AgentManager`, `StreamWatcher`, `runAgent`) lives in desktop with **zero Electron deps** — fully portable.

### Goals
1. Create `packages/chat-service` — shared package with core logic + tRPC router contract
2. Any host (desktop, sandbox) serves the router through its transport (IPC, HTTP)
3. Any client (desktop, mobile, web) consumes via `createTRPCReact<ChatServiceRouter>()` — no ternaries
4. Fix session resumption brittleness (currently depends on Electric SQL propagation)
5. Add @file and @task mention support

---

## Architecture

```
Durable Stream (unchanged):
  Client ←→ apps/api ←→ DurableStreams     messages, approvals, tool results, abort, config
  useDurableChat → apps/api                 stays as-is

Chat Service (new — host-dependent: needs local filesystem):
  packages/chat-service/
    ├── Core logic         file search, slash commands, agent execution
    ├── tRPC router        THE contract — workspace queries + session activation
    └── React client       createTRPCReact<ChatServiceRouter>() + Provider

  Hosts serve the router:
    Desktop:  mount into electron tRPC root → served via IPC
    Sandbox:  @trpc/server/adapters/fetch → served via HTTP (future)

  Clients consume via Provider:
    Desktop:  <chatService.Provider client={ipcClient}>
    Web/Mobile: <chatService.Provider client={httpClient}>
    Components: chatService.workspace.searchFiles.useQuery(...) — zero ternaries

Task Search (client-side — no host needed):
  Tasks are org-level, already loaded on every client for task views.
  MentionPopover searches them in-memory with fuse.js — no network round-trip.
  Sandboxes don't need task data at all.
```

### What lives where

| Concern | Where | Why |
|---------|-------|-----|
| Messages, approvals, tool results, abort | Durable stream | Need durability + multi-client visibility |
| Session config (model, permissionMode, etc.) | Durable stream | Agent reads in real-time, other clients see it |
| File search, slash commands | Chat-service router | Need local filesystem access |
| Session activate/isActive | Chat-service router | Direct to host, eliminates Electric SQL lag |
| Task search (for @ mentions) | Client-side (fuse.js) | Org-level data already loaded on client, avoids syncing tasks to 100s of sandboxes |
| Task context (for agent) | Server-side DB query in runAgent | One-off fetch when agent processes `@task:SLUG`, not a search |
| Available models | API (existing or new endpoint) | Org-level, not host-specific |
| Agent lifecycle (start/stop AgentManager) | Host-specific (not in shared router) | Desktop: renderer tells main. Sandbox: auto-starts |

---

## tRPC Router Contract

```ts
// packages/chat-service/src/router/index.ts
import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

export const searchFilesInput = z.object({
  workspaceId: z.string().uuid(),
  query: z.string(),
  includeHidden: z.boolean().default(false),
  limit: z.number().default(20),
});

export const chatServiceRouter = t.router({
  workspace: t.router({
    // File search for @ mentions — fast-glob + fuse.js on host filesystem
    searchFiles: t.procedure
      .input(searchFilesInput)
      .query(async ({ input }): Promise<FileSearchResult[]> => {
        const rootPath = await resolveWorkspaceRootPath(input.workspaceId);
        return searchFiles({
          rootPath,
          query: input.query,
          includeHidden: input.includeHidden,
          limit: input.limit,
        });
      }),

    // Slash commands available in this workspace
    getSlashCommands: t.procedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return getSlashCommands(input.workspaceId);
      }),
  }),

  session: t.router({
    // Is the host watching this session? (UI status indicator)
    isActive: t.procedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .query(({ input }) => {
        return { active: agentManager.hasWatcher(input.sessionId) };
      }),

    // Ensure host is watching this session — idempotent
    // Called on first message send (NOT on mount — avoids delay viewing old chats)
    activate: t.procedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .mutation(({ input }) => {
        agentManager.ensureWatcher(input.sessionId);
        return { active: true };
      }),
  }),
});

export type ChatServiceRouter = typeof chatServiceRouter;
```

### Client consumption

```ts
// packages/chat-service/src/client/index.ts
import { createTRPCReact } from "@trpc/react-query";
import type { ChatServiceRouter } from "../router";

export const chatService = createTRPCReact<ChatServiceRouter>();
```

Each app wraps once at the top level:
```tsx
// Desktop — IPC
<chatService.Provider client={ipcClient} queryClient={queryClient}>

// Web/Mobile — HTTP (future)
<chatService.Provider client={httpClient} queryClient={queryClient}>
```

### Task search — client-side, not in router

Tasks are org-level data already loaded on every client (for task boards, lists, etc.). The MentionPopover searches them in-memory — no network round-trip, no syncing to sandboxes:

```tsx
// MentionPopover — task search is local
const { data: orgTasks } = trpc.task.byOrganization.useQuery(organizationId);

const taskResults = useMemo(() => {
  if (!taskQuery || !orgTasks) return [];
  const fuse = new Fuse(orgTasks, {
    keys: [{ name: "slug", weight: 3 }, { name: "title", weight: 2 }],
    threshold: 0.4,
    ignoreLocation: true,
  });
  return fuse.search(taskQuery, { limit: 20 });
}, [orgTasks, taskQuery]);
```

The agent still fetches task details server-side when it encounters `@task:SLUG` in a message — that's a one-off DB query in `runAgent()`, not a search.

### Desktop gateway routing

Desktop main process routes `workspace.searchFiles` based on workspace type:
```ts
// Local workspace → run fast-glob locally
// Sandbox workspace → forward to sandbox's HTTP chat-service endpoint
```

---

## Package Structure

```
packages/chat-service/
  package.json                               deps: fast-glob, fuse.js, @electric-sql/client,
  tsconfig.json                                    @superset/db, @superset/durable-session
  src/                                             peerDeps: react, @trpc/react-query
    index.ts                                 barrel: server-side exports
    router/
      index.ts                               tRPC router + exported type + Zod schemas
    workspace/
      file-search/
        file-search.ts                       fast-glob + fuse.js, 30s TTL cache
        index.ts
      slash-commands/
        slash-commands.ts                    workspace command discovery
        index.ts
    agent/
      index.ts                               barrel
      agent-manager.ts                       Electric SQL watcher → StreamWatcher lifecycle
      stream-watcher.ts                      SessionHost → runAgent bridge
      run-agent.ts                           runAgent, resumeAgent, @file + @task parsing
      anthropic-auth/
        anthropic-auth.ts                    Claude credential reading
        index.ts
      models.ts                              available model list
    client/
      index.ts                               createTRPCReact<ChatServiceRouter>() + re-exports
```

---

## Implementation Steps

### Step 1: Create package + core workspace logic

**New:** `packages/chat-service/package.json`, `tsconfig.json`

**New:** `packages/chat-service/src/workspace/file-search/file-search.ts`
Migrate from: `apps/desktop/src/lib/trpc/routers/filesystem/index.ts` (lines 10-143)
- `buildSearchIndex()`, `getSearchIndex()`, 30s TTL cache, `DEFAULT_IGNORE_PATTERNS`
- Fuse config: `keys=[{name:"name",weight:2},{name:"relativePath",weight:1}], threshold:0.4`

**New:** `packages/chat-service/src/router/index.ts` — tRPC router, type export, Zod schemas

**New:** `packages/chat-service/src/client/index.ts` — `createTRPCReact<ChatServiceRouter>()`

### Step 2: Migrate agent execution

**New:** `packages/chat-service/src/agent/agent-manager.ts`
Migrate from: `apps/desktop/src/main/lib/agent-manager/agent-manager.ts`
- Accept `electricUrl`, `apiUrl` as constructor params (remove `env.main` import)
- Add `hasWatcher(sessionId)` and `ensureWatcher(sessionId)` methods

**New:** `packages/chat-service/src/agent/stream-watcher.ts`
Migrate from: `apps/desktop/src/main/lib/agent-manager/utils/stream-watcher.ts`
- Accept `apiUrl` as constructor param (remove `env.NEXT_PUBLIC_API_URL` import)

**New:** `packages/chat-service/src/agent/run-agent.ts`
Migrate from: `apps/desktop/src/main/lib/agent-manager/utils/run-agent.ts`
- Add `parseTaskMentions()` + `buildTaskMentionContext()` for @task mentions
- `buildTaskMentionContext` does a one-off DB query: `select from tasks where slug in (...)`

**New:** `packages/chat-service/src/agent/anthropic-auth/anthropic-auth.ts`
Migrate from: `apps/desktop/src/main/lib/agent-manager/utils/anthropic/auth/auth.ts`

**New:** `packages/chat-service/src/agent/models.ts`
Migrate from: `apps/desktop/src/main/lib/agent-manager/utils/models.ts`

### Step 3: Desktop integration

**Modify:** `apps/desktop/src/lib/trpc/routers/agent-manager/` → rename to `chat-service/`
- Import `searchFiles`, `AgentManager` from `@superset/chat-service`
- Import Zod schemas from `@superset/chat-service/router`
- Add `workspace.searchFiles`, `workspace.getSlashCommands` procedures
- Add `session.isActive`, `session.activate` procedures
- Keep agent lifecycle as host-specific procedures (start/stop AgentManager)
- For `workspace.searchFiles`: route to local or sandbox based on workspace type

**Modify:** `apps/desktop/src/lib/trpc/routers/index.ts` — rename `agentManager` → `chatService`

**Delete:** `apps/desktop/src/main/lib/agent-manager/` — migrated to package

**Modify:** Renderer — wrap chat UI with `chatService.Provider`:
```tsx
import { chatService } from "@superset/chat-service/client";
// Create IPC client, wrap ChatInterface with chatService.Provider
```

### Step 4: Add `workspaceId` to `chatSessions`

**Modify:** `packages/db/src/schema/schema.ts` — add to `chatSessions`:
```ts
workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
```

**Modify:** `packages/db/src/schema/relations.ts` — add workspace ↔ chatSessions relation

**Modify:** `apps/api/src/app/api/streams/[...path]/route.ts` PUT handler — accept `workspaceId` in body

**Modify:** `ChatInterface.tsx` — pass `workspaceId` when creating sessions

**Migration:** `bunx drizzle-kit generate --name="add_workspace_id_to_chat_sessions"` (on neon branch)

### Step 5: Refactor MentionPopover + activate on send

**Rename:** `FileMentionPopover/` → `MentionPopover/`
Path: `apps/desktop/src/renderer/.../ChatInterface/components/`

Key changes:
- Remove `useFileSearch` import (renderer-local hook → electronTrpc.filesystem)
- File search: `chatService.workspace.searchFiles.useQuery({ workspaceId, query })`
- Task search: client-side fuse.js over `trpc.task.byOrganization.useQuery(organizationId)` (already loaded)
- Two `<CommandGroup>`s: "Files" and "Tasks"
- Detect `@task:` prefix → switch to task search mode
- On file select: insert `@relative/path`
- On task select: insert `@task:SLUG`
- Rename exports: `FileMentionProvider` → `MentionProvider`, etc.

**Modify:** `ChatInputFooter.tsx`
- Updated imports (MentionProvider, MentionAnchor, MentionTrigger)
- Placeholder: `"Ask to make changes, @mention files, run /commands"`

**Modify:** `ChatInterface.tsx` — activate on first message send:
```tsx
const handleSend = useCallback(async (message: { text: string }) => {
  const text = message.text.trim();
  if (!text) return;
  chatService.session.activate.mutate({ sessionId });
  sendMessage(text);
}, [sessionId, sendMessage]);
```

### Step 6: Agent-side task mention parsing

**In:** `packages/chat-service/src/agent/run-agent.ts`

Add alongside existing `parseFileMentions`:
```ts
const TASK_MENTION_REGEX = /@task:([\w-]+)/g;

function parseTaskMentions(text: string): string[] {
  return [...new Set([...text.matchAll(TASK_MENTION_REGEX)].map(m => m[1]))];
}

// One-off DB query — NOT a search index. Only called when agent processes a message.
async function buildTaskMentionContext(slugs: string[], orgId: string): Promise<string> {
  const rows = await db.select().from(tasks)
    .where(and(inArray(tasks.slug, slugs), eq(tasks.organizationId, orgId), isNull(tasks.deletedAt)));
  return rows.map(t =>
    `<task slug="${t.slug}" title="${t.title}" status="${t.statusId}">${t.description ?? ""}</task>`
  ).join("\n");
}
```

Update `runAgent()` to call both parsers and inject context.

---

## Mention Format

| Resource | Inserted text | Agent regex | Example |
|----------|--------------|-------------|---------|
| File | `@relative/path` | `/@([\w./-]+(?:\/[\w./-]+\|\.[\w]+))/g` (existing) | `@src/lib/auth.ts` |
| Task | `@task:SLUG` | `/@task:([\w-]+)/g` | `@task:SUPER-288` |

---

## Files Summary

### New files (packages/chat-service/)
1. `package.json`, `tsconfig.json`
2. `src/index.ts` — server-side barrel
3. `src/router/index.ts` — tRPC router, `ChatServiceRouter` type, Zod schemas
4. `src/client/index.ts` — `createTRPCReact<ChatServiceRouter>()`
5. `src/workspace/file-search/` — `file-search.ts`, `index.ts`
6. `src/workspace/slash-commands/` — `slash-commands.ts`, `index.ts`
7. `src/agent/` — `index.ts`, `agent-manager.ts`, `stream-watcher.ts`, `run-agent.ts`, `models.ts`
8. `src/agent/anthropic-auth/` — `anthropic-auth.ts`, `index.ts`

### Modified files
9. `packages/db/src/schema/schema.ts` — `workspaceId` on `chatSessions`
10. `packages/db/src/schema/relations.ts` — workspace ↔ chatSessions relation
11. `apps/api/src/app/api/streams/[...path]/route.ts` — accept `workspaceId` in PUT body
12. `apps/desktop/src/lib/trpc/routers/agent-manager/` → renamed to `chat-service/`, adds workspace + session procedures
13. `apps/desktop/src/lib/trpc/routers/index.ts` — `agentManager` → `chatService`
14. `ChatInterface.tsx` — pass `workspaceId`, activate on first send, wrap with Provider
15. `FileMentionPopover/` → `MentionPopover/` — files via chatService, tasks via client-side fuse.js
16. `ChatInputFooter.tsx` — updated imports + placeholder text

### Deleted
17. `apps/desktop/src/main/lib/agent-manager/` — migrated to package

### Untouched
18. `apps/api/src/app/api/streams/[...path]/route.ts` — stream routes unchanged (except small workspaceId addition)
19. `packages/durable-session/` — `useDurableChat` stays pointed at apps/api
20. `apps/desktop/src/lib/trpc/routers/filesystem/` — kept for sidebar file browser

---

## Verification

1. `bun install` from root — no resolution errors
2. `bun run typecheck` — no type errors
3. `bun run lint:fix` — no lint issues
4. Start desktop app → AgentManager starts, no console errors
5. Open workspace, start new chat → session created with `workspaceId`
6. Send a message → `activate` fires, agent responds
7. Type `@` → MentionPopover opens with file results from chatService router
8. Fuzzy search → results appear, debounced
9. Select file → `@path/to/file` inserted
10. Type `@task:` → task results appear (client-side, instant)
11. Select task → `@task:SUPER-288` inserted
12. Send `fix @src/index.ts per @task:SUPER-288` → agent receives file content + task details
13. Close and reopen old chat → messages load instantly (no agent spin-up)
14. Send message in old chat → `activate` fires, agent resumes watching, processes message
