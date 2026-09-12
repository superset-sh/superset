# Forward remote workspace ports to the local machine

> **Superseded in part:** the host leg described below (`/tcp/:port`, one relay
> dial-back per TCP connection) was replaced before merge by a multiplexed
> `/fwd?workspaceId=` session — one relay stream per workspace, numbered
> streams inside (`@superset/shared/port-forward-mux`). The desktop manager,
> UX, and ownership rule shipped as planned. This document is the historical
> design record; the code is the contract.


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan/SKILL.md`.


## Purpose / Big Picture


Today the ports sidebar shows ports that listen on a remote host, but `localhost:PORT` on the user's machine points at nothing. The user must open an SSH tunnel or a Tailscale route by hand.

After this change, when the user selects a remote workspace in the desktop app, the desktop forwards every port that the workspace owns to the same port number on the user's machine. `http://localhost:3000` on the Mac then reaches the dev server on the remote host. Open, copy, and the in-app browser work for remote ports exactly as they do for local ports. When the user selects another workspace, the desktop stops the old forwards and starts the new ones. If a local process already uses a port, the row shows that the port is busy and offers to stop the local process or to use a different local port.

How to see it: start a remote host, open a remote workspace, run `bun dev` in one of its terminals, then open `http://localhost:3000` in a browser on the local machine. The dev server responds. Hot reload over WebSocket works.


## Assumptions


- The remote host runs a host-service build that speaks tunnel protocol v2 (relay2). Hosts on the deprecated v1 relay do not get forwarding. The desktop shows those ports as "forwarding unavailable on this host".
- The relay code in `apps/relay2` needs no change. It already splices any WebSocket path through to host-service.
- The user JWT that the desktop uses for the relay is available only in the renderer process. The renderer pushes it to the main process.
- A forwarded port carries raw TCP bytes. The desktop does not inspect the protocol.
- One PR delivers the transport interface plus the relay implementation. Direct (Tailscale, WireGuard, VPN, LAN) and SSH implementations can come in later PRs.


## Open Questions


None. All product decisions are recorded in the Decision Log.


## Progress


- [x] (2026-08-24 18:49Z) Discovery: traced relay2, tunnel-client-v2, port-scanner, ports UI. Product decisions collected from the user.
- [x] (2026-08-24 19:20Z) Milestone 1: `packages/host-service/src/ports/tcp-forward-route.ts` plus `tcp-forward-route.node-test.ts` (8 tests, run with `bun run test:integration:ports`). Registered in `app.ts` behind `wsAuth`.
- [x] (2026-08-24 19:45Z) Milestone 2: `apps/desktop/src/main/lib/port-forward/` (types, `RelayForwardTransport`, `PortForwardManager`, singleton), `portForwards` Electron router, `stopAll()` on `before-quit`. 7 tests pass.
- [x] (2026-08-24 20:05Z) Milestone 3: `PortForwardsProvider`, `useRemotePortForwarding` + `deriveForwardSyncInput`, `formatPortRowLabel`, `PortForwardBusyActions`, row and `usePortOpenActions` changes, JWT push from `setJwt`. 10 tests pass.
- [x] (2026-08-24 20:15Z) Milestone 4, docs: `remote-workspaces.mdx` and `ports.mdx` updated.
- [x] (2026-08-24 22:10Z) Milestone 4, end-to-end against the real host `gradfero` (Ubuntu, host-service 1.24.2 + this branch's bundle, relay2) from a dev desktop on the Mac: opening the remote workspace auto-forwarded 43104/8765 (active) and 3000 (busy, local owner unknown); `curl http://localhost:43104/` returned the remote python server's directory listing (HTTP 200, ~1 s per new connection); "Use another port" remapped 3000 → localhost:61559; switching to another route stopped every forward and released the local ports; switching back restarted them.
- [ ] Open the PR.


## Surprises & Discoveries


- Observation: relay2 needs no change. `apps/relay2/src/index.ts:240-265` upgrades any `GET /hosts/:hostId/*` WebSocket, asks the host to dial back, and `apps/relay2/src/host-tunnel.ts:244` splices frames verbatim, text and binary.
  Evidence: the browser CDP route (`packages/host-service/src/runtime/browser-bridge/browser-cdp-route.ts`) already reaches the host over this path with no relay code.
- Observation: the user JWT for the relay lives in the renderer (`apps/desktop/src/renderer/lib/auth-client.ts`, `ensureFreshJwt`). The main process has no copy.
  Evidence: `grep -rln "jwt" apps/desktop/src/main` returns nothing.
- Observation: under `bun test`, bytes that arrive on an accepted `net.Socket` before a consumer is attached are lost, even after `socket.pause()`. Node keeps them. The manager therefore attaches a bounded buffering `data` listener on accept and switches to `pipe` once the relay stream opens. This is also the right shape for production: a browser sends its request in the same tick as connect.
  Evidence: scratch scripts `dbg2.mjs`/`dbg3.mjs`: late `pipe` times out under Bun, early buffering passes under both runtimes.
- Observation: host-service WebSocket tests must run under `node --test` (`*.node-test.ts`), not `bun test`, because `@hono/node-ws` needs a real Node HTTP server. Added the `test:integration:ports` script next to the other integration scripts.
- Observation: `DashboardSidebarPortsProvider` is `enabled` only while a ports UI renders. Forwarding needs the port list whenever a v2 workspace route is active, so `layout.tsx` also enables it on `currentV2WorkspaceId !== null`.
- Observation: `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts` ("getProcessEnvWithShellPath applies shell PATH") fails on this machine before and after the change; it depends on the local shell PATH and is unrelated.
- Observation: navigating the dev app with `location.hash = ...` from CDP does not reach TanStack's router state (the app uses `renderer/lib/persistent-hash-history`), so the layout's `matchRoute` and my `useRouterState` selector both looked "stale" in that harness. With real clicks (workspace row, "Workspaces" nav) the auto path behaves: open → forwards start, leave → forwards stop and local ports are released. `RemotePortForwarder` now reads the pathname itself via `useRouterState` instead of the layout's fuzzy `matchRoute`, which keeps its previous value after leaving the workspace route.
- Observation: React 19's dev-only render logger throws `client[procedureType] is not a function` when it walks a component's props that contain a tRPC client proxy. It appears at renderer load in this dev profile independent of this change (the stack is `logComponentRender → addValueToProperties → tRPC apply trap`). Not addressed here.
- Observation: `gradfero` rejects loopback connections except on an allowlist (43104 and the host-service port answer; 3000 and 8765 give ECONNREFUSED even from an SSH shell on the box), so the e2e used 43104. Host-service reports the refused ports as `1011 upstream connect failed: ECONNREFUSED`, which the desktop shows as a reset connection; the row stays `active` because the stream did open. A follow-up could surface per-connection failures on the row.
- Observation: each new local TCP connection costs one relay dial-back (~1 s on this path). Browsers keep connections alive so page loads are fine, but tools that open a connection per request feel it. A later transport (Direct) removes it; the relay transport could also pre-dial one spare stream per forward.
- Observation: a dev renderer on `http://localhost:<port>` cannot talk to the production API (CORS allowlist is `https://app.superset.sh` and deployed origins; `superset://app` is not allowed either). For the e2e a test-only hook was injected into the dev main process through `electron-vite dev --inspect` that rewrites `Origin` to `https://app.superset.sh` on `api.superset.sh` requests and sets the matching CORS response headers. Nothing of this is in the repo.
- Observation: the v1 relay (`apps/relay`, Fly) sends client to host frames as text only (`apps/relay/src/index.ts:389`). Raw TCP cannot cross it.
  Evidence: `String(event.data)` on every client frame.


## Decision Log


- Decision (D-1): Transport is a raw TCP byte tunnel, not an HTTP reverse proxy.
  Rationale: dev servers use WebSockets for hot reload (Vite, Next.js). An HTTP proxy would need separate upgrade handling and would buffer bodies (`apps/relay2/src/http-exchange.ts` holds the full body in memory, 30 s timeout). A byte tunnel makes HTTP, WebSocket, gRPC, Postgres, and Redis work the same way.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-2): The desktop main process defines a `ForwardTransport` interface. PR 1 ships one implementation, `RelayForwardTransport`. Direct and SSH implementations come later.
  Rationale: no vendor lock-in. The relay URL is already API-served and overridable (`packages/trpc/src/lib/relay-url.ts`), so a self-hosted relay works. A Direct implementation later needs no plugin: Tailscale, WireGuard, and a VPN only give the host an IP address, and the desktop connects to it with plain TCP. The interface keeps that door open without shipping it now.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-3): Host-service forwards only ports that the port scanner attributes to the requested workspace.
  Rationale: the port scanner attributes ports by process tree from the terminal shell (`packages/port-scanner/src/port-manager.ts:294-346`). A workspace can reach only services it started. This blocks `127.0.0.1:5432`, `6379`, and cloud metadata endpoints unless the workspace runs them. The `ports.kill` procedure uses the same rule today.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-4): Forwards start automatically for the selected workspace. When the user selects another workspace, the desktop stops the old forwards and starts the new ones. No forwards run for workspaces that are not selected.
  Rationale: the user wants zero clicks and a smooth switch between workspaces. Bounding forwards to one workspace also bounds relay streams and local listeners.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-5): The local port number equals the remote port number. If the local port is busy, the forward enters a `busy` state and the row offers two actions: stop the local process (only when the local port scanner knows the process) or forward to an ephemeral port. The desktop never picks an ephemeral port on its own.
  Rationale: apps talk to each other by port number (a web app that calls `localhost:4000`, a database URL). A silent remap breaks those links. The user must see the conflict and choose.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-6): Every detected TCP port is forwardable. No HTTP probe.
  Rationale: a probe adds latency and breaks non-HTTP tools.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-7): Desktop only in PR 1. The web app and CLI come later.
  Rationale: the local listener needs Node `net`, which only the Electron main process has. The web app would need a public per-port HTTPS URL, which is a different design.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-8): The Direct transport, when built, authenticates with the user JWT and the same access check the relay does (`apps/relay2/src/auth.ts`, `apps/relay2/src/access.ts`). It does not trust the private network.
  Rationale: one identity model everywhere. Recorded now so the interface does not paint the later PR into a corner.
  Date/Author: 2026-08-24, Ymir.

- Decision (D-9): The renderer pushes the user JWT to the main process through a `portForwards.setRelayToken` mutation and re-pushes it when the JWT rotates. The main process does not mint JWTs.
  Rationale: `ensureFreshJwt` and the better-auth client exist only in the renderer. Moving auth into main is out of scope. Each new TCP connection dials the relay with the latest token.
  Date/Author: 2026-08-24, Claude (implementation detail).

- Decision (D-10): Forwarding requires relay protocol v2. The main process probes `${relayUrl}/health` once per relay URL and refuses to forward when the response lacks `proto: 2`.
  Rationale: see Surprises. v1 cannot carry binary client frames. The v1 relay is deprecated and the cutover to relay2 is in progress (`plans/20260804-1815-relay2-durable-objects-canonical.md`, D-20).
  Date/Author: 2026-08-24, Claude (implementation detail).


## Outcomes & Retrospective


Shipped in PR 1: the `ForwardTransport` interface with the relay implementation, the host-service `/tcp/:port` route gated on port ownership, automatic forwarding for the selected workspace, the busy-port choice (stop the local process or use another port), and the docs. Verified end to end against a real remote host (`gradfero`) through relay2: a page served on the host loaded at `localhost:<port>` on the Mac, forwards followed workspace selection, and unowned ports were refused.

Deferred to later PRs: the Direct transport (Tailscale, WireGuard, VPN, LAN) with JWT auth on host-service, the SSH transport, per-connection failure reporting on the row (today a refused upstream shows as a reset connection or the relay's generic "Host did not answer"), and pre-dialing a spare relay stream to hide the ~1 s per-connection dial-back.

Lessons: test the auto path with real clicks, not `location.hash` (the app's custom history ignores it); Bun drops socket data until a consumer is attached, so buffer from accept; the ownership rule catches servers started in subshells, which is a feature but will surprise users who `nohup` a dev server.


## Context and Orientation


Superset is a monorepo. This plan touches the desktop app (`apps/desktop`, Electron), the host-service package (`packages/host-service`, the process that runs on every host, local or remote), and the docs app (`apps/docs`). It reads from but does not change the relay (`apps/relay2`), the port scanner (`packages/port-scanner`), and the shared tunnel protocol (`packages/shared/src/tunnel-v2-protocol.ts`).

Terms used in this plan:

- **Host**: a machine that runs host-service. A **remote host** is one the user reaches through the relay instead of on the local machine.
- **Relay**: the public service at `relay2.superset.sh` (`apps/relay2`, a Cloudflare Worker with a Durable Object per host). The desktop and the host each hold a WebSocket to the relay. The relay pairs them.
- **Dial-back**: how relay2 opens one stream. The desktop upgrades `GET /hosts/<hostKey>/<path>` on the relay. The relay sends `{type:"stream:dial", ticket, kind:"ws", path, query}` to the host over a small control channel. The host opens a fresh WebSocket to `/v2/dial?ticket=...` and a second WebSocket to `ws://127.0.0.1:<hostServicePort><path>?token=<secret>`. The relay then splices frames between the desktop and the host without reading them. Code: `apps/relay2/src/index.ts:240-265`, `apps/relay2/src/host-tunnel.ts`, `packages/host-service/src/tunnel/tunnel-client-v2.ts:195-224`.
- **Host key**: `${organizationId}:${machineId}` built by `buildHostRoutingKey` in `packages/shared/src/host-routing.ts`.
- **Port scanner**: `packages/port-scanner`. `PortManager` finds listening TCP ports for every process under a terminal's shell and emits `port:add` and `port:remove` with a `DetectedPort { port, pid, processName, terminalId, workspaceId, detectedAt, address }`. Host-service holds one instance at `packages/host-service/src/ports/port-manager.ts`.
- **Ports router**: host-service tRPC router `packages/host-service/src/trpc/router/ports/ports.ts` with `getAll`, `subscribe`, and `kill`. The desktop calls it per host through `getHostServiceClientByUrl(hostUrl)`.
- **Electron tRPC**: the type-safe bridge between renderer and main. Routers live in `apps/desktop/src/lib/trpc/routers/` and are mounted in `apps/desktop/src/lib/trpc/routers/index.ts`. The renderer calls them through `electronTrpc` from `renderer/lib/electron-trpc`.
- **wsAuth**: a Hono middleware in `packages/host-service/src/app.ts:251-262` that checks `?token=` against the host-service secret on WebSocket routes. The tunnel client injects that secret on every dial-back, so a stream that arrives through the relay passes wsAuth.

Current desktop behaviour for ports:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData/useDashboardSidebarPortsData.ts` queries `ports.getAll` per online host and patches the cache from `port:changed` events. Each row is a `DashboardSidebarPort` with `hostType: "local-device" | "remote-device"` and `hostUrl`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions/usePortOpenActions.ts:26` sets `canOpenInBrowser = port.hostType === "local-device"`. Remote rows only navigate to the workspace.
- Row components: `.../TopBar/components/TopBarPortsDropdown/components/TopBarPortRow/TopBarPortRow.tsx` and `.../DashboardSidebarPortsChip/components/DashboardSidebarPortHoverRow/DashboardSidebarPortHoverRow.tsx`.
- The selected workspace id is `activeV2WorkspaceId` in `.../DashboardSidebar/DashboardSidebar.tsx:267`.
- The desktop main process has no proxy listener. It has `findAvailablePort` and `canBindPort` in `apps/desktop/src/main/lib/host-service-utils.ts:31-65`, and a loopback Express plus `ws` server in `apps/desktop/src/main/lib/browser/browser-bridge.ts:322`. The `ws` package (8.21.3) is a desktop dependency.
- The desktop also runs a local `PortManager` for local workspaces at `apps/desktop/src/main/lib/terminal/port-manager.ts`, with `treeKillWithEscalation` as the kill function.

Data flow after this plan:

    Local browser
      → 127.0.0.1:3000  (net.Server in desktop main, one per forward)
      → per connection: WebSocket to wss://relay2/hosts/<hostKey>/tcp/3000?workspaceId=<id>&token=<jwt>
      → relay2 dial-back to host-service
      → host-service GET /tcp/3000 (wsAuth, then ownership check)
      → net.connect(127.0.0.1, 3000) on the host
      → dev server


## Plan of Work


### Milestone 1: host-service `/tcp/:port` WebSocket route


This milestone makes host-service able to bridge one WebSocket to one local TCP socket. At the end, a test client that opens `ws://127.0.0.1:<hostServicePort>/tcp/<port>?workspaceId=<id>&token=<secret>` gets a byte pipe to `127.0.0.1:<port>` on the host, but only when the port scanner attributes that port to that workspace.

Create `packages/host-service/src/ports/tcp-forward-route.ts` with `registerTcpForwardRoute({ app, upgradeWebSocket, portManager })`. Model it on `packages/host-service/src/runtime/browser-bridge/browser-cdp-route.ts`. The route is `app.get("/tcp/:port", upgradeWebSocket(...))`.

In `onOpen`: parse `port` from the path and `workspaceId` from the query. Reject with close code `1008` and reason `"workspaceId is required"` when the query is missing. Call `portManager.getPortsByWorkspace(workspaceId)` and look for an entry whose `port` equals the requested port. When none exists, close with `1008` and reason `"port not owned by workspace"`. Do not fall back to `getAllPorts()`; ownership is the whole security model (D-3). When found, call `net.connect({ host: "127.0.0.1", port })`. Use the `address` field of the `DetectedPort` only if it is a loopback address; otherwise still connect to `127.0.0.1`, because a server bound to `0.0.0.0` also answers on loopback.

Piping: on `socket.on("data", chunk)` send the chunk as a binary WebSocket frame. On WebSocket `onMessage`, write `event.data` to the socket. Text frames are an error; close with `1003` (unsupported data). Buffer frames that arrive before the socket connects, bounded to 64 frames or 4 MiB like the CDP route, and close with `1009` on overflow. Backpressure: when `socket.write` returns `false`, stop reading is not possible on the WebSocket side with Hono's adapter, so instead cap `ws` buffered bytes: if the raw `ws` `bufferedAmount` exceeds 8 MiB, pause the socket (`socket.pause()`) and resume on `drain`. The Hono `ws` context exposes the raw socket as `ws.raw`; `packages/host-service/src/terminal/terminal.ts:1341` already reads `socket.raw?.bufferedAmount` this way. On socket `close` or `error`, close the WebSocket with `1000` or `1011`. On WebSocket close, destroy the socket.

Keep every frame under 1 MiB: the relay's Durable Object rejects larger messages. Node `net` delivers chunks of at most 64 KiB by default, so this holds without extra code; add a comment that states the limit.

Register the route in `packages/host-service/src/app.ts` next to `registerBrowserCdpRoute`, and add `app.use("/tcp/*", wsAuth)` next to the other `wsAuth` lines so the host-service secret is required. The tunnel client already injects that secret on every dial-back (`tunnel-client-v2.ts:210`), so a stream that arrives through the relay passes.

Tests: `packages/host-service/src/ports/tcp-forward-route.test.ts`. Start a Hono app with the route and a fake `portManager` whose `getPortsByWorkspace` returns a fixed list. Start a local echo TCP server on port 0. Cases: bytes echo both ways; a port not in the list closes with `1008`; a missing `workspaceId` closes with `1008`; closing the WebSocket destroys the TCP socket; closing the TCP socket closes the WebSocket.


### Milestone 2: desktop main `PortForwardManager` and `portForwards` router


This milestone makes the main process able to listen on a local port and bridge each accepted connection through the relay. At the end, a renderer can call `electronTrpc.portForwards.sync` and reach a remote port through `localhost`, though no UI does so yet.

Create the folder `apps/desktop/src/main/lib/port-forward/` with these files.

`types.ts` defines the interface and the state:

    import type { Duplex } from "node:stream";

    export interface ForwardTarget {
    	hostUrl: string; // e.g. https://relay2.superset.sh/hosts/<orgId>:<machineId>
    	workspaceId: string;
    	remotePort: number;
    }

    export interface ForwardTransport {
    	readonly kind: "relay"; // later: "direct" | "ssh"
    	/** Resolves when the transport can serve this host, rejects with a reason otherwise. */
    	probe(target: Pick<ForwardTarget, "hostUrl">): Promise<void>;
    	/** One bidirectional byte stream to 127.0.0.1:<remotePort> on the host. */
    	openStream(target: ForwardTarget): Promise<Duplex>;
    }

    export type PortForwardStatus =
    	| { state: "active"; localPort: number }
    	| { state: "busy"; localPort: number; localOwner: { pid: number; processName: string; terminalId: string; workspaceId: string } | null }
    	| { state: "error"; message: string };

    export interface PortForward {
    	id: string; // `${hostUrl}|${workspaceId}|${remotePort}`
    	target: ForwardTarget;
    	status: PortForwardStatus;
    	transport: ForwardTransport["kind"];
    	connections: number;
    }

`relay-forward-transport.ts` implements `ForwardTransport` for relay2. `probe` fetches `${relayOrigin}/health` and rejects with `"Host relay does not support port forwarding (protocol v1)"` unless the JSON has `proto === 2`. Cache the result per relay origin for the process lifetime. `openStream` builds the URL `${hostUrl}/tcp/${remotePort}?workspaceId=${workspaceId}&token=${jwt}` with the `https` scheme swapped to `wss`, opens a `ws` `WebSocket` with `binaryType` left as buffer, and returns `createWebSocketStream(ws)` from the `ws` package. That helper gives a Node `Duplex` over the socket, with backpressure. The JWT comes from a `getToken: () => string | null` option that the manager passes in. When the token is null, reject with `"Not signed in"`.

`port-forward-manager.ts` exports a `PortForwardManager` class and a singleton `portForwardManager`. It holds a `Map<string, ForwardEntry>` where `ForwardEntry` has the `PortForward` plus the `net.Server`. Methods:

- `setRelayToken(token: string | null)`: stores the JWT used by the relay transport.
- `sync({ hostUrl, workspaceId, ports }: { hostUrl: string; workspaceId: string; ports: number[] })`: the only way a forward starts. Computes the desired set of ids. Stops every forward whose id is not in the set (any workspace, any host: only the selected workspace forwards, D-4). Starts a forward for every id not yet running. Returns the current list.
- `retryEphemeral(id)`: for a `busy` forward, listen on port 0 instead and move to `active` with the assigned port.
- `stopAll()`: called from app quit (`before-quit` in `apps/desktop/src/main/index.ts` or wherever the browser bridge shuts down).
- `list()`: returns `PortForward[]`.
- `subscribe(listener)`: emits the full list on every change. Use Node `EventEmitter`.

Starting a forward: call `transport.probe`. On rejection, status becomes `error` with the message. Then `net.createServer` and `listen(remotePort, "127.0.0.1")`. On `EADDRINUSE`, status becomes `busy`. To fill `localOwner`, look up `remotePort` in the local `portManager` (`apps/desktop/src/main/lib/terminal/port-manager.ts`) with `getAllPorts()`; when a match exists, copy `pid`, `processName`, `terminalId`, and `workspaceId`; otherwise `null`. On `listening`, status becomes `active`.

Per accepted connection: `transport.openStream(target)` then `socket.pipe(stream).pipe(socket)`. Destroy both on `error` or `close` on either side. Count open connections in `connections`. When `openStream` rejects (host offline, access denied, relay 503), destroy the accepted socket immediately so the browser sees a connection reset, and set the forward status to `error` with the message; the next `sync` from the renderer retries.

Stopping a forward: close the server, destroy every open socket, delete the entry, emit.

Electron tRPC router `apps/desktop/src/lib/trpc/routers/port-forwards/port-forwards.ts` with `index.ts`, mounted as `portForwards` in `apps/desktop/src/lib/trpc/routers/index.ts`:

- `setRelayToken` mutation, input `{ token: string | null }`.
- `sync` mutation, input `{ hostUrl: string, workspaceId: string, ports: number[] }`, returns `PortForward[]`.
- `retryEphemeral` mutation, input `{ id: string }`.
- `killLocalOwner` mutation, input `{ id: string }`: reads `localOwner` from the forward, calls the local `portManager.killPort({ terminalId, workspaceId, port })`, waits up to 3 s for the port to free (poll `canBindPort` every 250 ms), then restarts the forward. Refuses when `localOwner` is `null`.
- `list` query.
- `subscribe` subscription using `observable` like `apps/desktop/src/lib/trpc/routers/ports/ports.ts` does, emitting `PortForward[]`.

Share the types with the renderer through `apps/desktop/src/shared/types/port-forwards.ts` (re-export `PortForward`, `PortForwardStatus`, `ForwardTarget`). The renderer must not import from `main/`.

Tests: `apps/desktop/src/main/lib/port-forward/port-forward-manager.test.ts` with a fake transport whose `openStream` returns a `PassThrough`-based `Duplex` connected to a local echo server. Cases: `sync` starts a listener on the requested port and bytes echo through it; a second `sync` with another workspace stops the first forward; a busy port yields `busy` with `localOwner: null` when the local port manager has no match; `retryEphemeral` moves it to `active` on a port other than the requested one; `stopAll` closes everything; `probe` rejection yields `error`.

Run `bun run lint:check-node-imports` from `apps/desktop` after this milestone; the shared types file must not pull `node:stream` into the renderer. Keep the `Duplex` import out of `shared/types`.


### Milestone 3: renderer auto-forward, row UI, collision UI


This milestone wires the selected workspace to `portForwards.sync` and updates the port rows. At the end, selecting a remote workspace forwards its ports, rows show the mapping, and Open works.

Token push. In `apps/desktop/src/renderer/lib/auth-client.ts`, `setJwt` is the single place the JWT changes. Add a call there that invokes `electronTrpcClient.portForwards.setRelayToken.mutate({ token })`. `electronTrpcClient` is the vanilla (non-hook) client exported from `apps/desktop/src/renderer/lib/trpc-client.ts:14`; `setJwt` is not a component, so hooks do not apply. Check for an import cycle between `auth-client.ts` and `trpc-client.ts` first; if one exists, register a listener from `trpc-client.ts` instead of importing in the other direction. Also push the current JWT once on app start so main has it before any forward.

Auto-forward hook. Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useRemotePortForwarding/useRemotePortForwarding.ts` with `index.ts` and a test. Input: `activeWorkspaceId: string | null`. It reads all ports through `useDashboardSidebarAllPorts()` from `providers/DashboardSidebarPortsProvider`. It selects the rows where `workspaceId === activeWorkspaceId` and `hostType === "remote-device"`. It calls `electronTrpc.portForwards.sync.useMutation()` with `{ hostUrl, workspaceId, ports }` whenever the sorted port list or the workspace changes, debounced 200 ms so a burst of `port:changed` events yields one call. When the active workspace is local or null, it calls `sync` with an empty port list so main stops every forward. Mount the hook in `DashboardSidebar.tsx` next to where `activeV2WorkspaceId` is computed (line 267 area), inside the ports provider.

Forward state in the renderer. Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider/PortForwardsProvider.tsx` that subscribes with `electronTrpc.portForwards.subscribe.useSubscription` and exposes `usePortForward(port: DashboardSidebarPort): PortForward | null` keyed by `${hostUrl}|${workspaceId}|${port}`. Mount it inside `DashboardSidebarPortsProvider`.

Open actions. In `usePortOpenActions.ts`: read `const forward = usePortForward(port)`. Set `canOpenInBrowser = port.hostType === "local-device" || forward?.status.state === "active"`. Set `portUrl` to `http://localhost:${forward?.status.state === "active" ? forward.status.localPort : port.port}`. Keep `openPrimary` as it is; with the new `canOpenInBrowser` a forwarded remote port opens like a local one.

Rows. In `DashboardSidebarPortHoverRow.tsx` and `TopBarPortRow.tsx`, render the label from one shared helper `formatPortRowLabel({ port, forward })` in `.../DashboardSidebar/utils/formatPortRowLabel/` (used by both rows, so it lives at the highest shared parent per AGENTS.md). Output:

- local port: `localhost:3000` (unchanged)
- remote, active, same port: `3000 · forwarded`
- remote, active, other port: `3000 → localhost:54321`
- remote, busy: `3000 · local port busy`
- remote, error: `3000 · <message>` with a tooltip that holds the full message
- remote, not selected workspace: `3000 · remote` (no forward runs for it)

Collision actions. When the forward is `busy`, the row shows two buttons: "Stop local <processName>" (only when `localOwner` is not `null`) which calls `portForwards.killLocalOwner`, and "Use another port" which calls `portForwards.retryEphemeral`. Put them in a small component `.../DashboardSidebarPortHoverRow/components/PortForwardBusyActions/`. The top bar row reuses the same component; if that makes it used twice, promote it to `.../DashboardSidebar/components/PortForwardBusyActions/`.

Tests: `useRemotePortForwarding.test.ts` asserts that a change of active workspace calls `sync` with the new workspace's remote ports and that a local active workspace calls `sync` with an empty list. `formatPortRowLabel.test.ts` covers the six label cases.


### Milestone 4: docs and end-to-end acceptance


Update `apps/docs/content/docs/remote-workspaces.mdx` section "Ports on a remote host": replace the "aren't forwarded to your machine yet" paragraph. New text: the desktop forwards the ports of the selected remote workspace to the same port numbers on the local machine; when a local port is busy the row offers to stop the local process or use another port; forwarding needs a host on the current relay (host-service 1.20.2 or newer); SSH and Tailscale remain options for hosts that are not reachable through the relay. Update `apps/docs/content/docs/ports.mdx` "Remote Workspaces" section the same way and keep the "forward a port yourself" section as a fallback.

Then run the acceptance in "Validation and Acceptance".


## Concrete Steps


All commands run from the repo root unless stated.

    bun install

Milestone 1:

    bun test packages/host-service/src/ports/tcp-forward-route.test.ts
    # Expected: 5 pass, 0 fail
    cd packages/host-service && bun run typecheck && cd ../..
    # Expected: no errors

Milestone 2:

    bun test apps/desktop/src/main/lib/port-forward
    # Expected: all pass
    cd apps/desktop && bun run typecheck && bun run lint:check-node-imports && cd ../..
    # Expected: no errors, no node-import violations

Milestone 3:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar
    # Expected: all pass, including useRemotePortForwarding and formatPortRowLabel

Whole tree, before the PR:

    bun run typecheck
    bun run lint
    bun test
    # Expected: no errors, all tests pass


## Validation and Acceptance


End-to-end, with two machines or one machine plus a cloud host:

1. On the remote host, run a host-service build that includes Milestone 1. Turn on remote access (Settings → Security, or `superset start` on a headless host).
2. On the local machine, start the desktop app with `bun dev` from `apps/desktop`. Sign in to the same organization.
3. In the Workspaces list, pick the remote host with the Device filter and open a workspace.
4. In a terminal of that workspace, start a dev server on port 3000 (for example `bunx serve -l 3000 .` or `bun dev` in a Next.js app).
5. Observe: the port row for 3000 shows `3000 · forwarded` within about 3 seconds.
6. On the local machine, open `http://localhost:3000` in a system browser. Expected: the page from the remote host loads. For a Vite or Next.js app, edit a file on the host and observe hot reload in the local browser, which proves WebSocket frames pass.
7. Click the port row. Expected: the in-app browser or the external browser opens `http://localhost:3000` per the Settings → Links → Ports preference.
8. Select a local workspace. Expected: the row for the remote 3000 changes to `3000 · remote`, and `http://localhost:3000` no longer connects.
9. Start a local process on 3000 (for example `python3 -m http.server 3000`). Select the remote workspace again. Expected: the row shows `3000 · local port busy` with a "Use another port" button and no "Stop local" button (the local port scanner does not own the python process). Click "Use another port". Expected: the row shows `3000 → localhost:<n>` and `http://localhost:<n>` reaches the remote server.
10. Stop the python process. Run a dev server on 3000 in a local Superset workspace terminal, then select the remote workspace. Expected: the row shows "Stop local <processName>". Click it. Expected: the local process stops and the row changes to `3000 · forwarded`.
11. Quit the desktop app. Expected: `lsof -iTCP:3000 -sTCP:LISTEN` on the local machine shows no listener.

Security check: from the desktop, with a WebSocket client (for example `bunx wscat`), open `wss://<relay>/hosts/<hostKey>/tcp/5432?workspaceId=<id>&token=<jwt>` for a port the workspace does not own. Expected: the socket closes with code 1008 and reason "port not owned by workspace".

Relay v1 check: point `RELAY_URL` at the v1 relay for a host that still uses it. Expected: rows for that host show `3000 · Host relay does not support port forwarding (protocol v1)`.


## Idempotence and Recovery


`sync` is idempotent: the same input yields the same set of forwards and restarts nothing that already runs. Repeated `retryEphemeral` calls on an active forward are no-ops. `stopAll` is safe to call more than once.

If a forward gets stuck in `error` after the host reconnects, selecting another workspace and then the remote workspace again issues a fresh `sync` that restarts it.

Rollback: the feature adds one route to host-service and one router to the desktop. Removing `registerTcpForwardRoute` from `app.ts` disables the host side; a desktop without Milestone 2 and 3 code behaves as today. There is no database change.


## Artifacts and Notes


Expected host-service close codes on `/tcp/:port`:

    1008 "workspaceId is required"
    1008 "port not owned by workspace"
    1003 "text frames not supported"
    1009 "frame backlog exceeded"
    1011 "upstream connect failed: <errno>"

Expected label examples in the sidebar:

    3000 · forwarded
    3000 → localhost:54321
    3000 · local port busy


## Interfaces and Dependencies


Host-service: `net` from Node, Hono `upgradeWebSocket` from `@hono/node-ws` (already used). New export `registerTcpForwardRoute` from `packages/host-service/src/ports/tcp-forward-route.ts`.

Desktop main: `net` and `stream` from Node, `WebSocket` and `createWebSocketStream` from `ws` (8.21.3, already a dependency). New module `apps/desktop/src/main/lib/port-forward/` with `ForwardTransport`, `RelayForwardTransport`, `PortForwardManager`, and the singleton `portForwardManager`.

Desktop shared types, `apps/desktop/src/shared/types/port-forwards.ts`:

    export interface ForwardTarget { hostUrl: string; workspaceId: string; remotePort: number }
    export type PortForwardStatus =
    	| { state: "active"; localPort: number }
    	| { state: "busy"; localPort: number; localOwner: { pid: number; processName: string; terminalId: string; workspaceId: string } | null }
    	| { state: "error"; message: string };
    export interface PortForward { id: string; target: ForwardTarget; status: PortForwardStatus; transport: "relay"; connections: number }

Electron tRPC router `portForwards`: `setRelayToken`, `sync`, `retryEphemeral`, `killLocalOwner`, `list`, `subscribe`, as described in Milestone 2.

Renderer: `useRemotePortForwarding`, `PortForwardsProvider` with `usePortForward`, `formatPortRowLabel`, and the `PortForwardBusyActions` component, as described in Milestone 3.

Later PRs (not in scope, recorded so the interface fits them): `DirectForwardTransport` with `probe` that tries host-advertised addresses and `openStream` that dials host-service on that address with the user JWT (D-8); `SshForwardTransport` that spawns `ssh -N -L`.


## Revision notes


- 2026-08-24: first draft from discovery plus the product decisions D-1 to D-8 the user gave in this session. D-9 and D-10 are implementation decisions that follow from the code.
- 2026-08-25: e2e round 2 after the switch-away fix. `useRemotePortForwarding` also dedupes syncs with a ref because the tRPC mutation handle is not referentially stable.
- 2026-08-24 (implementation): Milestones 1 to 3 and the docs part of 4 are built. Deviations from the draft: the host route takes a `getPortsByWorkspace` callback instead of the whole `portManager` (easier to test); the auto-forward hook is mounted from `layout.tsx` through a `RemotePortForwarder` component rather than from `DashboardSidebar.tsx`, because the sidebar can be closed in top-bar mode; the hook test covers the pure `deriveForwardSyncInput` function since the repo does not use `renderHook`.
