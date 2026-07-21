# Freeform Sessions — non-workspace chat & terminal

**Status:** Design
**Branch:** `sidebar-freeform-sessions`
**Owner:** Kiet

## Problem

Every chat and terminal session today must belong to a **workspace** — an isolated
git-worktree of a project, with a branch and a `worktreePath`. That coupling is enforced
in the session creation paths even though the storage layer doesn't require it.

There's no home for work that isn't tied to a repo:

- a throwaway terminal to run `gh`, `curl`, a one-off script, poke at `~`
- an ad-hoc AI chat to reason about something, draft a note, explore an idea
- quick work you don't want to spin up a worktree (and a project, and a branch) for

Users either create a junk workspace or don't do the work in Superset at all.

## Goal

A new **Freeform** section in the sidebar listing sessions not tied to any workspace,
project, or worktree. From it you can start a chat or a terminal that runs in a default
directory on a host — no branch, no worktree, no project row.

## What already supports this

The persistence layer is already workspace-optional. The block is in creation code, not
the schema.

| Layer | Table | FK to workspace | State |
| --- | --- | --- | --- |
| Cloud (Postgres) | `chatSessions` | `workspaceId`, `v2WorkspaceId` | **nullable**, `onDelete: set null` |
| Host-service (SQLite) | `terminalSessions` | `originWorkspaceId` | **nullable**, `onDelete: set null` |
| Chat engine (`packages/chat`) | — | takes a raw `cwd` string | **workspace-agnostic** |
| PTY daemon (`packages/pty-daemon`) | — | takes a raw `cwd` | **workspace-agnostic** |

The enforcement that forces a workspace lives in three places:

1. `packages/trpc/src/router/chat/chat.ts` — `createSession` requires `v2WorkspaceId: z.uuid()`.
2. `packages/host-service/src/runtime/chat/chat.ts` (~L447-461) — looks up the workspace,
   throws `"Workspace not found"`, sets `cwd = workspace.worktreePath`.
3. `packages/host-service/src/trpc/router/terminal/terminal.ts` (L18) + `terminal/terminal.ts`
   (~L947-969) — requires `workspaceId`, resolves `cwd` from `worktreePath`.

## Runtime model (decided: default directory)

A workspace-less session still needs a **host** (a machine running host-service) and a
**cwd**. The decision for v1 is the simplest model: **freeform sessions run in a default
directory on the host** — the host's home directory (`~`) by default.

- **cwd:** a new host setting `freeformCwd` (host-service `hostSettings`), defaulting to
  the OS home dir. No worktree is created; git is irrelevant.
- **Host:** the freeform session records a `hostId`. With one host, it's implicit; with
  several, the create flow shows a host picker (reuse the pattern from `v2Host.list`).
- **No project, no branch, no worktree row.** A freeform session is `{ id, kind, hostId,
  title, cwd, createdBy, lastActiveAt }`.

### Accepted tradeoff of the home-dir choice

Because freeform sessions default to a single shared directory, they share filesystem
state and can step on each other (two terminals both writing `~/scratch.txt`). That's an
accepted v1 tradeoff. Two cheap mitigations, both optional and additive later:

- Make `freeformCwd` configurable per host (already planned above) so a user can point it
  at a dedicated scratch dir.
- A follow-up can opt a session into a per-session subdir (`<freeformCwd>/<sessionId>`)
  behind a toggle — no schema change, just cwd resolution.

## Backend changes

### 1. Host-service: default cwd when there's no workspace

- Add `freeformCwd` to `hostSettings` (`packages/host-service/src/db/schema.ts`), default
  `os.homedir()`. A `getFreeformCwd(hostSettings)` helper returns it.
- `runtime/chat/chat.ts`: when the incoming `workspaceId` is null/absent, skip the
  workspace lookup and set `cwd = getFreeformCwd()` instead of throwing.
- `terminal/terminal.ts` `createTerminalSessionInternal`: allow a null `workspaceId`;
  `resolveTerminalCwd(cwdOverride, getFreeformCwd())` instead of `worktreePath`. Persist
  `terminalSessions.originWorkspaceId = null`.
- `trpc/router/terminal/terminal.ts`: `workspaceId: z.string().optional()`.

### 2. Cloud: optional workspace, required host

- `packages/trpc/src/router/chat/chat.ts` `createSession`:
  - `v2WorkspaceId: z.uuid().optional()`
  - require a `hostId` when `v2WorkspaceId` is absent (a freeform session still needs to
    know where it runs).
- Add nullable `hostId` to `chatSessions` so a freeform chat knows its host without a
  workspace to derive it from.
- **Discriminator:** `v2WorkspaceId IS NULL` already distinguishes freeform from workspace
  sessions; no `kind` column strictly needed. Add a lightweight `kind: 'workspace' |
  'freeform'` only if we find query sites that would otherwise repeat the null check.

### 3. Listing freeform sessions

- New query `chat.listFreeform` (cloud) → `chatSessions WHERE v2WorkspaceId IS NULL AND
  createdBy = me`, ordered by `lastActiveAt`.
- Terminals: `terminal.listSessions` filtered to `originWorkspaceId IS NULL`.
- The sidebar merges chat + terminal freeform sessions into one recency-grouped list.

## UI / UX

The new agents UI (`app/(agents)`) currently has **no left sidebar** — navigation is the
top `AgentsHeader`. This branch introduces a **left sidebar** alongside it. Design system:
existing shadcn semantic tokens (`bg-background`, `bg-muted/50`, `text-muted-foreground`,
`border-border`, `rounded-lg`) — match `SessionList` / `SessionCard` exactly.

### Sidebar structure

Keep it dead simple — two plain sections, no icons or metadata on the chat rows. Each row
is just a **title** and a right-aligned **relative time**.

```
  Projects
   ▤ superset
       Jo                    1m     ← nested session, selected
  Chats
   Renew California DL       3h
   Find Hawaii nature tours  15h
   Apply for Japan visa      2d
```

- **Section labels** `Projects` / `Chats` are plain muted text (not the uppercase
  micro-labels) — one weight, generous spacing above each section.
- **Projects** lists projects; a project's sessions nest one indent under it. The active
  session gets a rounded selected background.
- **Chats** is the non-workspace section: a **flat list** (no recency grouping, no icons,
  no subtitle) ordered by `lastActiveAt`, each row `{title}` + `{time}`. This is the whole
  point of the section — quick, scannable, nothing tied to a repo.
- Terminals live here too but read the same as chats (title + time); the type only matters
  once you open the session.

### Routes

- `/agents/freeform` — freeform home: a prompt input (start a chat) + New terminal button +
  the full freeform session list. Mirrors the structure of `/agents`.
- `/agents/freeform/[sessionId]` — a freeform session view. Same `SessionTabs` shell as a
  workspace session, but:
  - Header badge reads **Freeform** (not a branch); subtitle shows `{host}:{cwd}`.
  - Chat sessions render `SessionChat`; terminal sessions render `WebTerminal`.
  - No **Diff** tab (nothing is a worktree, so there's no branch diff to show).

### Create flow

`+ New` (top) and the `FREEFORM +` affordance both surface:

- **New chat** → creates a freeform `chatSession` on the default/selected host, routes to
  `/agents/freeform/[id]`, focuses the prompt.
- **New terminal** → creates a freeform terminal on the default/selected host, routes to
  `/agents/freeform/[id]`.
- If more than one host: an inline host submenu; otherwise the default host is used
  silently.

### Empty state

`FREEFORM` with no sessions shows a one-line prompt: *"Start a chat or terminal that isn't
tied to a project."* with the two create buttons — not a full-screen empty state.

## Edge cases

- **Host offline.** Render the session optimistically; don't gate on host reachability
  (matches the v2 direction — no full-screen host-offline gates). Operations degrade where
  they actually fail.
- **Multiple hosts.** Persist the chosen `hostId` on the session; a session is pinned to
  the host it was created on. No cross-host migration in v1.
- **Session history.** Ending a freeform terminal keeps its `terminalSessions` row (status
  `ended`); it still appears in `Older` until deleted, consistent with workspace terminals.
- **Deletion.** A freeform session delete is a real delete (no workspace to `set null`
  back to). Add a row action / confirm.

## Future (not in v1)

- **Promote to workspace.** A freeform chat that turns into real project work can be
  "moved into a workspace" — pick a project, create a worktree, re-parent the session by
  setting `v2WorkspaceId`. The nullable FK makes re-parenting a single update.
- **Per-session isolated cwd** behind a toggle (see tradeoff section).
- **Named freeform folders** (a `freeformCwd` per named scratch space) if users want more
  than one default location.

## Rollout

1. **Backend, host-service** — `freeformCwd` setting + default-cwd paths in chat runtime
   and terminal creation. Shippable behind no UI; verifiable via tRPC.
2. **Backend, cloud** — optional `v2WorkspaceId` + `hostId` on `createSession`;
   `listFreeform`. (Cloud/API deploys before desktop — see deploy ordering.)
3. **Frontend** — left sidebar + `FREEFORM` section, `/agents/freeform` routes, create
   menu. Start against mock data, swap to the real queries.
4. **Future** — promote-to-workspace, isolated cwd.

## Key files

- `packages/trpc/src/router/chat/chat.ts` — cloud `createSession` (require→optional workspace)
- `packages/host-service/src/runtime/chat/chat.ts` — chat cwd (~L447-461)
- `packages/host-service/src/trpc/router/terminal/terminal.ts` + `terminal/terminal.ts` — terminal cwd (~L947-969)
- `packages/host-service/src/db/schema.ts` — `hostSettings` (+ `freeformCwd`), `terminalSessions`
- `packages/db/src/schema/schema.ts` — `chatSessions` (+ nullable `hostId`)
- `apps/web/src/app/(agents)/components/SessionList/*` — reuse grouping + card
- `apps/web/src/app/(agents)/agents/page.tsx` — structure to mirror for `/agents/freeform`
