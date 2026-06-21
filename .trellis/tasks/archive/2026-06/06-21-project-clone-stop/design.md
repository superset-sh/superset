# Design: Stop project clone

## Scope

This task adds Stop for the desktop `Add repository -> Clone a repository` path. It does not add pause/resume and does not change workspace creation stop semantics.

## Architecture

The clone runs in host-service, so cancellation must be host-service owned:

1. Renderer starts `project.create` with a client-generated `progressRequestId`.
2. Host-service registers the in-flight clone under that `progressRequestId`.
3. Renderer calls a new project cancel mutation with the same `progressRequestId`.
4. Host-service aborts the registered clone, kills the `git clone` process tree, and lets the existing clone cleanup remove the target directory.
5. Host-service emits `project:create-progress` updates so both the open modal and hidden/background toast reflect `canceling` / `canceled`.

## API And Event Contracts

### tRPC

- Existing create input remains:
  - `project.create({ name, progressRequestId, mode: { kind: "clone", parentDir, url } })`
- Add:
  - `project.cancelCreate({ progressRequestId })`
  - Returns a typed result:
    - `{ status: "canceling" }` when an active clone accepted the stop request.
    - `{ status: "not_found" }` when the request id no longer has a live operation.
    - `{ status: "not_cancelable" }` when the operation exists but is past the clone phase, if that state needs to be represented.

### Event Bus

Extend `ProjectCreateProgressStage`:

- Existing: `queued`, `cloning_repository`, `repository_ready`, `registering_project`, `ready`, `failed`
- New: `canceling`, `canceled`

Event payload shape stays unchanged:

```ts
{
  type: "project:create-progress";
  requestId: string;
  stage: ProjectCreateProgressStage;
  message: string;
  percent: number | null;
  occurredAt: number;
}
```

## Host-Service Cancellation Model

### Registry

Add a small process-local registry for clone create operations, keyed by `progressRequestId`.

Each entry stores:

- `AbortController`
- current phase (`"clone"` at minimum)
- a `cancel()` function that emits `canceling` and aborts exactly once

Lifecycle:

- Register before calling `cloneRepoInto`.
- Unregister immediately after `cloneRepoInto` resolves/rejects, before project registration begins.
- If cancel is requested while registered, abort the clone.
- If cancel is requested after unregister, return `not_found`; this avoids deleting a clone that may already be registered as a project.

### Git Process

`cloneWithProgress` currently spawns:

```ts
spawn("git", ["clone", "--progress", repoCloneUrl, targetPath], ...)
```

Update clone options to accept `signal?: AbortSignal`.

When the signal aborts:

- Mark the operation as canceled.
- Kill the spawned process tree with `treeKillWithEscalation`.
- Reject with a specific clone-canceled error instead of a generic git failure.

`cloneRepoInto` already owns and claims the target directory. Its catch block should remove the target directory for canceled clones and rethrow a cancellation-specific error so `createFromClone` can emit `canceled`.

## Renderer UX

`NewProjectModal` keeps the current progress behavior and adds Stop:

- While clone is cancelable:
  - Show `Hide` as the non-destructive background action.
  - Show `Stop` as the destructive cancellation action.
  - Include a Stop action on the loading toast, so hidden/background clone can be stopped.
- While stopping:
  - Disable duplicate Stop requests.
  - Show "Stopping clone".
- When canceled:
  - Toast becomes "Clone stopped".
  - Modal fields remain populated if the modal is open.
  - Clone button becomes enabled again.
  - Do not call parent `onError`, because this is user-requested cancellation, not create failure.

## Validation And Error Matrix

- Active clone + Stop -> process tree terminated, partial directory removed, progress ends as `canceled`.
- Stop clicked twice -> first request cancels, later request is ignored or returns `not_found`; no duplicate error toast.
- Stop after clone phase -> graceful no-op result; no deletion of a completed project or repository.
- Git exits from cancellation -> renderer shows "Clone stopped", not "Failed to clone repository".
- Git exits from real failure -> renderer keeps existing error behavior.
- Host-service unavailable during Stop -> renderer shows an actionable stop failure, and progress remains as last known state.

## Trade-Offs

- Use Stop only, not Pause: `git clone` has no reliable app-level pause/resume contract, and freezing processes would be brittle across network state and app restarts.
- Use `progressRequestId` as the cancellation key: it already identifies the clone operation across renderer, event bus, and host-service. This avoids introducing a separate operation id.
- Keep cancellation in memory: a host-service restart naturally kills the child process and loses the operation. Persisting cancellation state is unnecessary for an in-flight local process.
