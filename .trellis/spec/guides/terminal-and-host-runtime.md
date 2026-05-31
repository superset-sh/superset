# Terminal And Host Runtime

## Package Boundaries
- `packages/pty-daemon` owns live PTYs and is standalone. It must not import from `@superset/host-service` or other workspace packages; host-service consumes protocol types through `@superset/pty-daemon/protocol`.
- `packages/host-service` is the local machine service. It owns Hono routes, SQLite state, git/runtime managers, event bus, terminal WebSocket routes, and daemon supervision.
- `apps/desktop/src/main` coordinates Electron windows and packaged services. Renderer code talks to Electron main through tRPC from `apps/desktop/src/lib/trpc` and to host-service through typed clients.

## IPC And Subscriptions
Desktop Electron IPC uses tRPC. For `trpc-electron`, subscriptions must return observables, not async generators.

```ts
import { observable } from "@trpc/server/observable";

publicProcedure.subscription(() =>
  observable<MyEvent>((emit) => {
    const handler = (event: MyEvent) => emit.next(event);
    emitter.on("event", handler);
    return () => emitter.off("event", handler);
  }),
);
```

Source: `apps/desktop/CLAUDE.md` and `apps/desktop/src/lib/trpc/routers/index.ts`.

## PTY Byte Fidelity
- PTY input and output bytes ride in the pty-daemon frame binary payload tail. Do not base64 encode them inside JSON.
- Do not decode output with per-chunk `chunk.toString("utf8")` in the data path. The host-service observer path uses `StringDecoder` only for string callback compatibility.
- Primary terminal WebSocket output is binary; renderer/xterm consumes `Uint8Array`. Control messages remain JSON.
- Flow control is byte-counted. Renderer acks consumed bytes; host-service forwards `output-ack` to the daemon.

## Daemon Lifecycle
- The daemon runs under Node 20+ via Electron's bundled Node. Bun is the build/test tool, not the production daemon runtime.
- The Unix socket file mode `0600` is the auth boundary; do not add ad hoc in-band tokens to the pty-daemon protocol.
- Protocol version negotiation happens with `hello` and `hello-ack` in `packages/pty-daemon/src/protocol/messages.ts`.
- Upgrade handoff preserves live sessions by passing PTY master fds to a successor process. Preserve tests in `packages/pty-daemon/test/handoff.test.ts` and `packages/host-service/src/terminal/terminal.adoption.node-test.ts` when changing adoption.

## Source Examples
- `packages/pty-daemon/README.md` documents runtime, layout, testing, and out-of-scope items.
- `packages/pty-daemon/src/protocol/framing.ts` and `messages.ts` define wire format.
- `packages/pty-daemon/src/Server/Server.ts` implements handshake, flow control, replay, and handoff.
- `packages/host-service/src/terminal/terminal.ts` bridges daemon sessions to workspace terminal WebSockets.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates packaged host-service lifecycle.
