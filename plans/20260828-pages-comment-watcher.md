# Pages Comment Watcher: Closing the Loop Between Readers and Agents

Status: implemented on branch `pages-watch`, and run end to end once against a live
agent — an agent published a page, a comment from the web viewer reached its
terminal, and its reply landed with `author_kind = agent`. The busy-hold,
failure/backoff, and reassignment paths are still only unit-tested against fakes.

Two things changed during implementation and are recorded in place below: the cloud
row became two columns on `pages` rather than a `page_watchers` table, and
`pageComment.activate` was deleted once activation moved to human write.

## Executive Summary

An agent publishes a page. A teammate opens the link and comments. Today nothing
carries that comment back to the agent unless a human, on desktop, opens the page
pane's hand-off menu and pushes it into a terminal by hand.

This design adds a **watcher**: a background poller in host-service that holds the
association "page P is watched by agent in terminal T", notices new human comments,
and types them into that terminal. The agent triages what it receives and answers
with the CLI commands it already has.

The watcher lives in host-service because that is the only process that can see both
halves of the problem — it already holds an authenticated cloud tRPC client
(`api/createApiClient/createApiClient.ts`, wired at `app.ts:85`) and it already owns
the terminals (`trpc/router/terminal/terminal.ts:172`). Every other candidate can see
one side or the other, not both.

Alongside the watcher, three smaller changes make the loop coherent: comments stop
being invisible after a republish, a sidebar makes every thread reachable, and the
activation flag stops meaning two different things.

The registry itself is **host-local memory** — no new table. Two nullable columns on
the existing `pages` row carry just enough for a reader's browser to show that an
agent is listening.

## Goals

- A comment left by anyone, anywhere, reaches the agent that owns the page without a
  human relaying it.
- The agent decides what deserves a reply or a fix. The system delivers; it does not
  triage.
- Both sides show their state: the page shows that an agent is watching, the agent
  shows which pages it watches.
- A human can reassign a page to a different running agent, or stop watching.
- One agent can watch many pages.
- Closing a terminal stops every watcher that terminal owned, promptly and visibly.
- Nothing keeps polling after the thing it was polling for is gone.

## Non-Goals

- Real-time push. Comments are human-typed and infrequent; a 5s poll is
  indistinguishable in practice and costs a fraction of the machinery.
- Watching from the browser. A browser has no terminal to deliver into, so it
  displays watcher state but never holds a watcher.
- Cross-host watching. A watcher and its terminal live on the same host.
- Durable delivery across host-service restarts. A restart drops the registry and the
  UI, which reads from the host, correctly shows nothing watching. Re-publish or
  re-assign to resume.
- Giving agent sessions their own credential. Agent attribution stays a claim, as
  documented in `page-comment/agent-access.ts`. This design works within that.

## Background: What Exists Today

- `pages`, `page_versions`, `page_comment_threads`, `page_comments` —
  `packages/db/src/schema/schema.ts:1215-1392`. Threads carry `agentActivatedAt` and
  are bound to a version via `pageVersionId`; comments carry `authorKind` and
  `agentSessionId`.
- `pageComment.list / create / reply / activate / resolve` —
  `packages/trpc/src/router/page-comment/page-comment.ts`.
- CLI: `superset pages publish | list | get | versions | pull` and
  `superset pages comments list | reply | resolve` — `packages/cli/src/commands/pages/`.
- The manual hand-off:
  `apps/desktop/.../PagePaneHeaderExtras/components/PageHandoffMenu/PageHandoffMenu.tsx`
  calls `pageComment.activate` then `terminal.send`. It is the only caller of
  `activate` in the repo, and it is desktop-only.
- No polling, subscription, or realtime path exists for pages or comments anywhere.

## Three Problems in the Current Model

**Comments disappear when the agent republishes.** `pageComment.list` filters threads
by `pageVersionId` (`page-comment.ts:110-125`) and the web store passes the served
version (`usePageCommentStore.ts:49`). Publish v2 and every v1 thread vanishes from
view. The rows survive; nothing shows them. The agent's reply — which is *about* the
republish — lands on a thread that became invisible at the moment it was written.

**Publishing revokes the agent's own permission to reply.** `publish.ts:163-167`
clears `agentActivatedAt` on every thread on the page, and `assertActivatedForAgent`
(`agent-access.ts:41`) then rejects the agent's reply. The `superset:page` skill
instructs the agent to publish *then* reply, so this fires on the normal path. It is
a pre-existing bug in the manual flow, not one this design introduces, but the
watcher walks straight into it.

**Threads whose anchor no longer resolves become unreachable.**
`PageCommentsView.tsx:188-190` guards pin rendering with `if (rect)`. A thread whose
CSS selector no longer matches the current version's DOM renders no pin and has no
other surface. It is not hidden — it is gone from the UI entirely.

## Architecture

```
agent terminal ──publish──> cloud                     reader's browser
      ▲                       │                             │
      │                       │                          comments
      │                       │                             │
      │                       v                             v
      │                  pages / page_comments <────────────┘
      │                       ▲
 terminal.send                │ poll
      │                       │
      └──── host-service watcher
            one ticker · Map<pageId, WatchEntry>   (source of truth)
                          │
                          └── heartbeat every 30s ──> pages.watch_heartbeat_at
```

One process, one ticker, N registry entries.

## Data Model: Two Columns, Not a Table

The registry in host memory is the source of truth. Every surface in the desktop app
— the terminal chip, the page indicator, the watcher picker — reads it over host tRPC
and needs nothing in the cloud.

The exception is the web page viewer. A reader on a shared link has no host access, so
if the page is to show that an agent is listening, the cloud has to hold it. Two
nullable columns on the existing `pages` row are enough:

| column | notes |
|---|---|
| `watched_by_agent` | text, nullable — display label, e.g. `claude` |
| `watch_heartbeat_at` | timestamptz, nullable — bumped at most every 30s |

A page is shown as watched when `now() - watch_heartbeat_at < 90s`. That decay is the
point: it is what stops the UI claiming an agent is listening after its terminal died,
its host went offline, or host-service restarted. A field recording only "an agent was
assigned" would have no way to stop being true.

Page-level rather than thread-level, deliberately. A freshly published page has no
threads at all, and that is exactly when a reader most wants to know whether commenting
will reach anyone. A marker on a thread only appears once someone has already
committed to commenting.

Not a separate table, because a page has at most one watcher and the association has no
history worth keeping. The invariant — **many pages per agent, one agent per page** —
is enforced by the registry being keyed on `pageId`, and mirrored by there being one
row per page to write into.

Migration via the `db-migrations` skill on a fresh Neon branch. No hand-editing of
`packages/db/drizzle/`.

## Cloud API Changes

**`publish.ts:163-167` — delete the activation wipe.** With activation now set on
human write (below), `agentActivatedAt` means *a human has invited agents into this
thread*. That invitation is not something a new version should revoke. Removing the
wipe fixes the publish-then-reply 403 on both the watcher path and the existing
manual path.

**`pageComment.create` and `pageComment.reply` — set `agentActivatedAt = now()` when
the author is human.** Commenting *is* the invitation; there is no separate hand-off
step. The flag becomes sticky and single-meaning. Dedupe is the watcher's cursor, not
this flag.

**`pageComment.list` — stop filtering by version.** Return every thread on the page
and add `version` (resolved from `pageVersionId`) and `authorKind` to the output. The
client already drops pins for unresolved anchors; the sidebar carries the rest.

**`pageComment.activate` — deleted.** Activation moved to the first human write, so
the explicit hand-off primitive no longer has a caller.

**`page.setWatch({ pageId, agentId })` / `page.clearWatch({ pageId })`** — writes the
two columns above; requires page-write access. `setWatch` doubles as the heartbeat,
so there is one mutation rather than a separate heartbeat procedure.

Watcher *assignment* remains a host tRPC concern. These procedures only publish the
fact outward for web readers; nothing reads them back to make a decision.

## The Watcher

`packages/host-service/src/page-watch/`

```
page-watch-manager.ts        # class; ctor {api, eventBus}; registry; ticker; start/stop
page-watch-manager.test.ts   # faked ApiClient
index.ts
```

Structure follows `packages/port-scanner/src/port-manager.ts`, the repo's only
end-to-end background-poller-to-status-chip path. Construction and teardown follow
`PullRequestRuntimeManager` rather than the port manager's module-level singleton —
this holds auth and talks to the cloud, so it gets dependency injection and an
explicit lifecycle.

```ts
type WatchEntry = {
  pageId: string; slug: string; title: string
  workspaceId: string; terminalId: string; agentId: string | null
  cursor: number                    // max human-comment createdAt delivered
  pings: Map<string, number>        // threadId -> count, circuit breaker
  lastHumanCommentAt: number        // TTL clock
  lastHeartbeatAt: number           // heartbeat clock, read by the tick below
  pendingSince: number | null       // set while delivery is held for a busy agent
  failures: number
}

const registry = new Map<string, WatchEntry>()   // pageId -> entry
```

Each tick, per entry:

```ts
const threads = await api.pageComment.list.query({ pageId })
const fired = threads.filter(t =>
  !t.resolved &&
  t.comments.some(c => c.authorKind === "human" && c.createdAt > cursor))

if (fired.length) {
  await sendToTerminal(terminalId, buildWatchPrompt(page, fired))
  cursor = maxHumanCreatedAt(fired)
}
if (now - lastHeartbeat > HEARTBEAT_MS) {          // 30s, not every tick
  await api.page.setWatch.mutate({ pageId, agentId })
  lastHeartbeat = now
}
```

Per tick that is one `list` read; the heartbeat write lands at most once per 30s per
page and is decoupled from the poll cadence on purpose — the poll needs to be fast,
the liveness signal does not.

Borrowed from the port manager, deliberately:

- **One shared `setInterval`**, lazily started when the registry becomes non-empty and
  stopped when it empties (`port-manager.ts:201,228`). Timers cannot accumulate, and
  an idle host runs none.
- **`.unref()`** on the ticker (`:212`) so it never holds the process open.
- **Two-tier cadence** (`isSessionDue`, `:283`): a page with a human comment in the
  last 5 minutes polls every 5s; quiet pages decay to 60s.
- **Reentrancy guard** — `isScanning` + a single queued follow-up (`:441,475`).
- **`AbortController`** around in-flight cloud calls (`:218`).
- **Reconcile, don't trust** — `reaper.ts:133-145` checks the registry against live
  sessions rather than relying on events. Each tick drops entries whose terminal no
  longer exists, so a missed exit event cannot strand a watcher.

Bounds, each one load-bearing:

| bound | value | prevents |
|---|---|---|
| watcher cap per host | 20 | unbounded registry growth |
| idle TTL | 2h without a human comment | forgotten pages polling forever |
| consecutive failures | stop at 5, surface why | a dead token retrying forever |
| pings per thread | 5 | see below; not reset by a republish |
| registry storage | in-memory only | stale watchers resurrecting on restart |

The per-thread ping cap deserves its reasoning. The trigger already ignores
`authorKind === "agent"`, which is what normally prevents the agent's own reply from
re-triggering it. But `agent-access.ts` is explicit that CLI attribution is "a claim,
not proof": an agent that runs the CLI without `SUPERSET_PANE_ID` set records its
reply as `human` and re-arms the trigger. The cap converts that from an infinite loop
into a bounded one.

## Lifecycle

**Registration** happens on `superset pages publish` when the CLI has both a
workspace and `SUPERSET_PANE_ID`. `--no-watch` opts out.

```
$ superset pages publish report.html
Published "Report" v2
https://…/page/report-a1b2c3
Watching for comments · replies go to this session
```

**Reassignment** goes through the same host endpoint from the desktop menu, so
publish-time and manual assignment share one code path.

**Teardown on terminal exit** hooks the same place the port manager does — the pty
`onExit` handler in `terminal/terminal.ts` (`:2849` for ports) — and sweeps:

```ts
onTerminalExit(terminalId) {
  for (const [pageId, w] of registry)
    if (w.terminalId === terminalId) {
      registry.delete(pageId)
      void api.page.clearWatch.mutate({ pageId })   // best effort
    }
  eventBus.broadcastPageWatchChanged(...)
}
```

Three independent mechanisms, none load-bearing alone: the broadcast darkens the
desktop indicators immediately, the best-effort `clearWatch` darkens web immediately,
and heartbeat decay covers the case where the process died before either ran.
Per-tick reconciliation against live terminals covers a missed exit event.

## What the Agent Receives

`buildWatchPrompt` follows the existing `PageHandoffMenu/utils/buildPrompt/`: page
title and slug, then per thread the anchor, thread id, anchored text, and each
comment. It adds one thing the manual prompt does not need — the instruction to pull
the page first:

```
superset pages pull <slug> > page.html
```

A human can assign a page to an agent that never wrote it. Without the pull, that
agent replies about HTML it has never seen.

The prompt states the loop explicitly: fix the source, republish, reply with
`superset pages comments reply --threadId <id>`, then `resolve`. It also states that
not every comment needs an answer — triage is the agent's job.

## UI

**Shared sidebar** — new `CommentsSidebar` in
`packages/ui/src/components/PageComments/components/`, consuming `useComments()`. The
provider already exposes everything it needs: `threads`, `rects` (the null-rect signal
that tells us an anchor no longer resolves), `activeThreadId`, `addReply`,
`setResolved`. Lists every thread across versions, badged by version, with unanchored
threads grouped at the end since they have no pin to focus. Its header carries watcher
detail: which agent, last checked, and a stop control. Used by both web and desktop.

**Agent side** — a chip in
`apps/desktop/.../TerminalPane/components/TerminalPaneHeaderExtras/TerminalPaneHeaderExtras.tsx:45`,
which already receives `workspaceId` and `terminalId`. `TerminalConnectionIndicator`
in the same slot is the existing template for a conditional dot-plus-label pill.
Clicking focuses the page pane. The dashboard agent row
(`DashboardSidebarAgentHoverRow.tsx:25-62`) gains the same information.

**Page side** — `PagePaneHeaderExtras.tsx` reads live host state and offers the picker.
Web's `PageHeaderBar` reads `watched_by_agent` + `watch_heartbeat_at` off the page and
shows a read-only indicator: watching, or nothing. Both reuse `StatusIndicator`
(`screens/main/components/StatusIndicator/StatusIndicator.tsx:50`), the pulsing-dot
primitive both UI generations already import.

**`PageHandoffMenu` is replaced, not extended.** It becomes a watcher picker: same
position, same data source (`useTerminalAgentBindings` filtered to `!endedAt`), but
the verb changes from a one-shot send to a standing assignment.

```
┌─ Report v2 ─────────────  ◉ watching: claude ⌄ ─┐
│                          ┌──────────────────────┐
│                          │ Watching             │
│                          │  ● claude    fan-puck│
│                          │ Assign to            │
│                          │  ○ codex     api-fix │
│                          │ ─────────────────────│
│                          │  Stop watching       │
└──────────────────────────└──────────────────────┘
```

**Event plumbing** — a `page-watch:changed` variant in `events/types.ts` beside
`:48`, a `broadcastPageWatchChanged` on `EventBus` mirroring `:285-300`, and the
mirror in `packages/workspace-client/src/lib/eventBus.ts`. Desktop consumes it the way
`useDashboardSidebarPortsData.ts` consumes ports: a query with a slow
`refetchInterval` fallback, patched in place by event-bus messages.

## Risks

**This is the first background loop in host-service that calls the Superset cloud on
a timer.** Every use of `ApiClient` today is either request-scoped or a one-shot at
startup or connect; intersecting the `setInterval` inventory with the `ApiClient`
inventory gives the empty set. The tunnel timers hit the relay over a raw socket, and
`PullRequestRuntimeManager`'s timers hit GitHub.

The pieces exist — `createApiClient` retries once on 401 after invalidating the JWT
cache, and `ConfigFileSessionTokenSource` refreshes OAuth tokens — but none has run
with no user present. Consequences to handle explicitly rather than discover: a
refresh token that expires with nobody around to re-login must stop the watcher with
a stated reason rather than spin; offline must back off, following the
`consecutiveFailures`-doubling TTL in `pull-requests.ts:64-68`; and the failure cap is
the last line between a dead credential and a permanent retry loop.

**Removing the publish wipe weakens a deliberate rule.** The comment at
`publish.ts:161-163` says a new version is not what anyone handed off. That intent was
right when activation was a per-version handshake. It is wrong once commenting is
itself the invitation, and keeping it breaks the loop on round one. The rule is not
being dropped by accident.

**Showing all versions' threads accumulates.** A long-lived page gathers threads whose
anchors stopped resolving several versions ago. They sort to the end of the sidebar
and draw no pins, but the list grows. If it becomes a problem, collapsing resolved
threads by default is the first lever.

## Testing

Watcher, against a faked `ApiClient`:

- an agent's reply attributed via `SUPERSET_PANE_ID` never re-triggers a ping; an
  unattributed one is recorded as human and can, bounded by the ping cap
- resolved threads are skipped
- terminal exit drops every entry for that terminal and clears its cloud rows
- an entry whose terminal vanished without an event is dropped by reconciliation
- the cap, the TTL, the failure stop, and the per-thread ping breaker each fire
- the ticker starts on first entry, stops on last removal, and is `unref()`ed

Cloud router:

- activation survives a republish — the regression that would silently break the loop
- a human `create`/`reply` sets `agentActivatedAt`; an agent reply does not
- `list` returns threads from every version with `version` and `authorKind` populated

UI:

- sidebar lists unanchored threads and they are focusable without a pin
- watcher indicator reflects assign, reassign, stop, and terminal exit

## Implementation Order

1. Cloud: drop the publish wipe, activate on human write, unfilter `list` and add
   `version` + `authorKind` — with tests, since everything downstream assumes these
2. Migration: `watched_by_agent` + `watch_heartbeat_at` on `pages`, plus
   `page.setWatch` / `page.clearWatch` (db-migrations skill, fresh Neon branch)
3. host-service `PageWatchManager` + host tRPC router + event type + terminal-exit
   sweep
4. CLI: register on publish, `--no-watch`
5. Shared `CommentsSidebar`
6. Desktop: watcher picker replacing `PageHandoffMenu`, terminal-side chip
7. Web: sidebar + read-only watcher indicator

Step 1 gates everything. Steps 5-7 are independent of each other once 3 lands.
