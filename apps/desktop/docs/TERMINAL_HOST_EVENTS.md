# Terminal Host Event Semantics

This document describes the event delivery model for the Terminal Host daemon protocol.

## Event Types

The daemon emits three event types to attached clients:

| Event   | Payload                             | Description                              |
|---------|-------------------------------------|------------------------------------------|
| `data`  | `{ type: "data", data: string }`    | PTY output (terminal content)            |
| `exit`  | `{ type: "exit", exitCode, signal?}` | PTY process terminated                   |
| `error` | `{ type: "error", error, code? }`   | Error condition (e.g., write queue full) |

## Socket Model

Clients connect with two sockets sharing a `clientId`:

- **Control socket** (`role: "control"`): RPC request/response (write, resize, kill, etc.)
- **Stream socket** (`role: "stream"`): Receives unsolicited events

Events are broadcast only to stream sockets. This separation prevents event floods from blocking RPC responses.

## Delivery Semantics

### At-Most-Once Delivery

Events are delivered **at-most-once** per attached client:
- No acknowledgment or retry mechanism
- If a client socket buffer is full, data is queued but may be lost on disconnect
- Clients must be prepared to miss events (especially `data` during reconnection)

### No Durability

Events are not persisted. If no clients are attached, events are emitted but not stored.
For cold restore, use `createOrAttach` which returns a `TerminalSnapshot` containing the current screen state.

## Ordering Guarantees

### Within a Session

Events for a single session are delivered **in-order** relative to each other:
1. PTY output order is preserved (data events arrive in the order produced)
2. Exit event is always delivered after all data events for that session
3. Error events may interleave with data events

### Across Sessions

No ordering guarantees across different sessions. Events from session A and session B may interleave arbitrarily.

## Backpressure Handling

The system implements multi-level backpressure to prevent memory exhaustion:

### Level 1: Client Socket Backpressure
```
Client socket buffer full
  → Session pauses subprocess stdout reads
  → Subprocess backpressures PTY reads
  → PTY write buffer fills → kernel blocks PTY writes
```

When the client drains its buffer, the chain resumes.

### Level 2: Subprocess stdin Backpressure
```
Write requests exceed MAX_SUBPROCESS_STDIN_QUEUE_BYTES (2MB)
  → Frame dropped
  → Error event emitted: { code: "WRITE_QUEUE_FULL" }
```

### Level 3: PTY Write Backpressure (in subprocess)
```
PTY kernel buffer full (EAGAIN/EWOULDBLOCK)
  → Exponential backoff retry (2ms → 50ms)
  → Write queue accumulates up to 64MB hard limit
  → Beyond limit: frames dropped, error reported
```

## Error Codes

| Code                | Meaning                                      |
|---------------------|----------------------------------------------|
| `WRITE_QUEUE_FULL`  | Input queue exceeded limit, data dropped     |
| `SUBPROCESS_ERROR`  | PTY subprocess reported an error             |
| `WRITE_FAILED`      | Failed to write to PTY                       |
| `UNKNOWN`           | Unclassified error                           |

## Race Conditions

### Kill vs Attach Race

Sessions track `terminatingAt` timestamp when `kill()` is called. The `isAttachable` property returns false for terminating sessions, preventing new attachments to sessions about to exit.

### Data vs Exit Race

The subprocess flushes all buffered output before sending the exit frame, so clients receive all terminal output before the exit event.

## Renderer Integration Notes (tRPC)

The renderer does **not** talk to the daemon directly. It consumes terminal output via the `terminal.stream` tRPC subscription (`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`), which bridges the main-process `TerminalManager`/`DaemonTerminalManager` EventEmitter.

### `exit` must not complete the subscription

Treat `exit` as a **state transition**, not a terminal end-of-stream:

- The renderer subscribes with a stable `paneId` input (`trpc.terminal.stream.useSubscription(paneId)`).
- `@trpc/react-query` does **not** auto-resubscribe after a subscription completes unless the input/key changes.
- We reuse the same `paneId` across restarts / cold restore (new session, same pane).

So the server-side observable must **not** call `emit.complete()` on `exit`, otherwise the pane becomes permanently detached from output (`listeners=0` in `DaemonTerminalManager` logs) even after a new shell is started.

### Cold restore overlay: drop stale queued events

During cold restore, the renderer intentionally pauses streaming (`isStreamReady=false`) while showing a read-only overlay. Stream events can be queued during this period. Before starting a new shell, the renderer should discard any queued events from the pre-restore session (especially stale `exit`) so they can't mark the new session as exited and trigger an unintended `restartTerminal()` (which clears the UI).

## Usage Example

```typescript
// Stream socket receives events as NDJSON
socket.on("data", (chunk) => {
  for (const line of chunk.toString().split("\n").filter(Boolean)) {
    const event = JSON.parse(line) as IpcEvent;
    if (event.type !== "event") continue;

    switch (event.event) {
      case "data":
        terminal.write(event.payload.data);
        break;
      case "exit":
        console.log(`Session ${event.sessionId} exited: ${event.payload.exitCode}`);
        break;
      case "error":
        console.error(`Error in ${event.sessionId}: ${event.payload.error}`);
        break;
    }
  }
});
```

## Related Files

- `types.ts` - Event type definitions
- `session.ts` - Event emission and backpressure logic
- `pty-subprocess.ts` - PTY-level backpressure handling
- `client.ts` - Client-side event handling
