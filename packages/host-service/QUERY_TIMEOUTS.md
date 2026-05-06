# Query Timeouts

Every host-service query procedure has a server-side timeout. If a query
takes longer than its budget, the procedure rejects with
`TRPCError({ code: "TIMEOUT" })`. The renderer's `QueryClient` retries
those errors a couple of times with linear backoff, so transient slow
ops self-recover without leaving the UI spinning forever.

## Where it lives

- **Server middleware**: `src/trpc/index.ts` — `timeoutMiddleware` races
  `next()` against a per-procedure timer.
- **Builder**: `queryProcedure = protectedProcedure.use(timeoutMiddleware)`
  in the same file. Use this for every `.query` procedure.
- **Per-procedure overrides**: `.meta({ timeoutMs })` on the procedure
  builder. Without `meta`, the default is 5000 ms.
- **Client retry**: `WorkspaceClientProvider` in `packages/workspace-client`
  retries `TIMEOUT` errors up to 2 times with `300 ms × attempt` backoff.
  Other errors keep the previous single retry.

Mutations stay on `protectedProcedure` because their latency is highly
variable (file writes, network calls) and a blanket budget would do more
harm than good.

## Adding a new query

```ts
// Defaults to 5s — fine for most local fs/git work.
myFastQuery: queryProcedure
  .input(...)
  .query(async ({ ctx, input }) => { ... }),

// Override when the work legitimately takes longer.
mySlowQuery: queryProcedure
  .meta({ timeoutMs: 30_000 })
  .input(...)
  .query(async ({ ctx, input }) => { ... }),
```

Pick the smallest budget that fits the slowest legitimate run on real
hardware. Too generous and the UX of a hung host-service degrades; too
tight and healthy queries time out under load.

## Current budgets

| Procedure | Budget | Reason |
|---|---|---|
| `filesystem.listDirectory`, `filesystem.getMetadata` | 5s | Fast in practice |
| `filesystem.readFile` | 30s | Large files (e.g. lockfiles, generated bundles) |
| `filesystem.searchFiles` | 30s | ripgrep on large repos |
| `filesystem.searchContent` | 60s | content search worst case |
| `git.listBranches`, `git.getBaseBranch`, `git.getPullRequest` | 5s | Cheap reads |
| `git.getStatus`, `git.getCommitFiles` | 15s | Slow on big working trees |
| `git.listCommits`, `git.getDiff`, `git.getBranchSyncStatus`, `git.getPullRequestThreads` | 30s | Long history, big diffs, GitHub API |

## What the timeout does *not* do

The middleware only races a timer against the procedure's `next()`
result. It does **not** kill the underlying work — `fs.readdir`, `git`
child processes, etc. continue server-side until they finish naturally.
For ops that *can* be cancelled, the procedure should plumb the
`AbortSignal` through. `filesystem.listDirectory` does this:
the renderer's tRPC client provides `signal` automatically (and
`abortOnUnmount: true` aborts on unmount), the procedure forwards it
to the `FsService`, and `workspace-fs/fs.ts::listDirectory` checks
`signal?.throwIfAborted()` between `fs.readdir` and each batch of stat
calls. Node's `fs.readdir`/`fs.stat` themselves ignore `AbortSignal`,
so the readdir syscall is uncancellable; we can only short-circuit
between operations.

## What a timeout looks like to the client

`TRPCClientError` with `error.data.code === "TIMEOUT"`. The
`WorkspaceClientProvider` retry predicate keys on this. Bespoke per-hook
retry logic should not be necessary — if it is, the procedure's budget
is probably wrong, or the underlying work isn't really a single query
and should be split.
