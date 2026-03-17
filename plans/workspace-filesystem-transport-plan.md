# Workspace Filesystem Transport Plan

## Summary

This plan defines the actual transport boundary for `packages/workspace-fs`.

The goal is not to redesign filesystem behavior again. The goal is to make the existing `workspace-fs` service callable through a real transport without changing higher-level consumers.

This should support two host modes:

- local desktop host: renderer -> Electron main -> local `workspace-fs` host
- remote workspace host: client -> network transport -> remote `workspace-fs` host

The transport plan should preserve the current local-first assumptions:

- `workspaceId` scopes access
- `absolutePath` remains the canonical local file identity
- `relativePath` remains display-only
- watcher/search state stays host-side

## What Exists Today

Current foundation already in place:

- transport-neutral core service contract in `packages/workspace-fs/src/core/service.ts`
- local host implementation in `packages/workspace-fs/src/host/service.ts`
- transport-neutral client factory in `packages/workspace-fs/src/client/index.ts`
- local desktop adapter in `apps/desktop/src/lib/trpc/routers/workspace-fs-service.ts`
- local desktop router in `apps/desktop/src/lib/trpc/routers/filesystem/index.ts`

That means the next work is transport implementation, not service redesign.

## Goals

- define one concrete request/response transport shape for `workspace-fs`
- define one concrete stream transport shape for watcher events
- keep local Electron IPC as an adapter over the same contract
- make remote hosting possible without changing service semantics
- keep host-side search/watch/index ownership
- make capability discovery explicit
- make reconnect/retry behavior well-defined

## Non-Goals

- do not migrate renderer state to `resourceUri`
- do not replace tRPC across the app
- do not implement a production remote workspace server in this plan
- do not change filesystem semantics, security rules, or path identity rules

## Transport Decision

Use a split transport model:

- unary operations over request/response RPC
- watcher events over a long-lived subscription stream

Recommended concrete mappings:

- local desktop: existing tRPC Electron IPC
- remote host: HTTP for unary calls, WebSocket for watch streams

Why:

- unary filesystem calls map cleanly to request/response
- watcher streams need ordering, reconnect, and low-overhead fanout
- WebSocket is the simplest fit for bidirectional session/auth plus continuous events
- keeping local tRPC is fine as long as it stays an adapter, not the service definition

## Contract Shape

### Unary methods

The transport should expose the same method names as `WorkspaceFsRequestMap`:

- `getServiceInfo`
- `listDirectory`
- `readTextFile`
- `readFileBuffer`
- `stat`
- `exists`
- `writeTextFile`
- `createFile`
- `createDirectory`
- `rename`
- `deletePaths`
- `movePaths`
- `copyPaths`
- `searchFiles`
- `searchKeyword`

Rules:

- every call is workspace-scoped
- every file target is absolute-path based
- method inputs/outputs must remain serializable
- host returns capability metadata from `getServiceInfo` before clients assume features

### Stream methods

The transport should expose one stream initially:

- `watchWorkspace`

Rules:

- events are ordered per workspace subscription
- events carry a host-generated `revision`
- `overflow` remains the explicit resync signal
- stream completion means transport/session ended, not filesystem quiescence

## Recommended Wire Format

### Unary request envelope

```ts
type WorkspaceFsRpcRequest = {
  service: "workspace-fs";
  method: keyof WorkspaceFsRequestMap;
  requestId: string;
  input: unknown;
};
```

### Unary response envelope

```ts
type WorkspaceFsRpcResponse = {
  requestId: string;
  ok: true;
  output: unknown;
} | {
  requestId: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
};
```

### Stream subscription envelope

```ts
type WorkspaceFsStreamSubscribe = {
  service: "workspace-fs";
  method: "watchWorkspace";
  subscriptionId: string;
  input: {
    workspaceId: string;
  };
};
```

### Stream event envelope

```ts
type WorkspaceFsStreamEvent = {
  subscriptionId: string;
  event: WorkspaceFsWatchEvent;
};
```

### Stream lifecycle envelope

```ts
type WorkspaceFsStreamLifecycle =
  | { subscriptionId: string; type: "ready" }
  | { subscriptionId: string; type: "error"; error: { code: string; message: string } }
  | { subscriptionId: string; type: "closed" };
```

This can sit behind tRPC locally and behind WebSocket remotely.

## Host Responsibilities

The host is responsible for:

- workspace resolution: `workspaceId -> rootPath`
- path validation and security
- filesystem queries and mutations
- watcher ownership
- search index ownership
- event coalescing
- overflow handling
- capability reporting

The transport layer is not responsible for:

- path validation
- search/index logic
- watcher normalization
- caching filesystem metadata

That logic stays inside `workspace-fs`.

## Client Responsibilities

The client is responsible for:

- marshalling request/response payloads
- marshalling stream subscribe/unsubscribe lifecycle
- reconnection policy
- surfacing `overflow` back to callers
- exposing the same `WorkspaceFsService` interface through `createWorkspaceFsClient(...)`

The client is not responsible for:

- rebuilding watcher semantics
- interpreting absolute vs relative path rules
- host-side security

## Capability Model

Use `getServiceInfo()` as the required first handshake.

Current fields already exist:

- `hostKind`
- `resourceScheme`
- `pathIdentity`
- `capabilities`

Transport-specific expectations:

- clients should cache `getServiceInfo()` per host session
- clients should reject unsupported operations early when capabilities are absent
- capability absence must mean "unsupported", not "transport failed"

## Error Model

Define stable transport error codes for the filesystem layer:

- `WORKSPACE_NOT_FOUND`
- `WORKSPACE_ROOT_UNAVAILABLE`
- `PATH_OUTSIDE_WORKSPACE`
- `PATH_NOT_FOUND`
- `PATH_ALREADY_EXISTS`
- `PERMISSION_DENIED`
- `UNSUPPORTED_OPERATION`
- `WATCH_OVERFLOW`
- `TRANSPORT_CLOSED`
- `INTERNAL_ERROR`

Rules:

- transport should preserve host error code + message
- UI should not parse raw error strings
- local IPC and remote transport should normalize to the same error shape

## Authentication and Context

### Local desktop host

- trust Electron main process as the host boundary
- renderer does not pass auth tokens to `workspace-fs`
- desktop router enforces user/workspace access before calling host methods

### Remote host

- transport must authenticate the user/session before any workspace call
- host must derive workspace access from authenticated context, not from client claims alone
- `workspaceId` remains an input, but host validates it against the authenticated principal

## Reconnect and Resync

Watcher streams must support reconnect behavior explicitly.

Rules:

- reconnect does not imply event replay unless the transport supports it
- initial version should reconnect and then rely on normal host watcher state plus `overflow`/refresh
- if transport disconnects, client should:
  1. reopen the stream
  2. resume normal event handling
  3. trigger consumer invalidation if reconnect confidence is low

Future enhancement:

- add explicit `sinceRevision` support if remote hosts need replay/catch-up

## Local Adapter Plan

Keep local desktop on the current router, but shape it as a transport adapter.

Implementation steps:

1. Treat `apps/desktop/src/lib/trpc/routers/filesystem/index.ts` as the local unary/stream transport surface.
2. Ensure each router procedure maps 1:1 to `WorkspaceFsRequestMap` / `WorkspaceFsSubscriptionMap`.
3. Keep response shaping in `apps/desktop/src/lib/trpc/routers/workspace-fs-service.ts`, not in renderer code.
4. Add a thin local transport object that could back `createWorkspaceFsClient(...)` even if local renderer keeps using tRPC for now.

Deliverable:

- local desktop transport is clearly one implementation of the service contract, not the contract itself

## Remote Adapter Plan

Define a remote transport package or module later, but plan around this shape now:

### Unary

- `POST /api/workspace-fs`
- request body is the RPC envelope
- response body is the RPC response envelope

### Stream

- `GET /api/workspace-fs/stream` upgraded to WebSocket
- client sends `watchWorkspace` subscribe envelope
- server sends `ready`, then ordered event envelopes

### Host placement

- host runs beside the workspace checkout
- host owns watchers/search/index
- network edge only forwards transport messages to the host service

Deliverable:

- remote host can satisfy the same client contract as local desktop

## Registry and Selection

Even if we skip implementation now, the transport plan assumes a future registry shape similar to the terminal runtime work:

- one process-scoped workspace-fs host registry
- per-workspace host selection
- host selection outside consumers

Recommended future shape:

```ts
interface WorkspaceFsHostRegistry {
  getForWorkspaceId(workspaceId: string): WorkspaceFsService;
  getServiceInfo(workspaceId: string): Promise<WorkspaceFsServiceInfo>;
}
```

This keeps host selection centralized when local and remote workspaces coexist.

## Testing Plan

### Unit tests

- request map and client factory round-trip
- resource URI generation/parsing
- host service capability metadata
- watcher event serialization
- transport error normalization

### Adapter tests

- local adapter: router -> host service -> client contract
- remote adapter: mock HTTP/WebSocket transport -> client contract

### Smoke tests

- `getServiceInfo` succeeds before any operation
- `listDirectory` works over transport
- `rename` followed by watcher event works over transport
- `watchWorkspace` reconnect path produces safe invalidation behavior

## Rollout

1. Keep desktop on local transport.
2. Add a local transport wrapper around existing router semantics.
3. Add transport contract tests.
4. Add a mock remote transport implementation in tests only.
5. When remote host work starts, implement the real HTTP/WebSocket adapter against the same contract.

## Acceptance Criteria

- `workspace-fs` service contract can be invoked through a concrete transport layer
- local desktop transport is clearly an adapter over `workspace-fs`, not custom filesystem logic
- `getServiceInfo` is the canonical capability handshake
- unary and stream transports use one shared contract model
- watcher streams remain host-owned and ordered
- remote hosting can be added without changing the core `WorkspaceFsService` interface

## Immediate Next Implementation

When work resumes on transport implementation, do this first:

1. add a concrete local transport object that implements the `WorkspaceFsClientTransport` interface against desktop tRPC
2. add an end-to-end local adapter test: host service -> local transport -> client factory
3. add a mock remote HTTP/WebSocket adapter test using the same client factory

That is the smallest slice that proves the transport boundary is real instead of only typed.
