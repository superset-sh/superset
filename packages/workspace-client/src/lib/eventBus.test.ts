import { afterEach, describe, expect, it } from "bun:test";
import { getEventBus, reconnectEventBusIfDown } from "./eventBus";

// Real WS server standing in for a host-service event bus. Records upgrades
// and client commands; `push` broadcasts a server event to connected clients.
function makeHostServer(port = 0) {
	const upgrades: string[] = [];
	const commands: Array<Record<string, unknown>> = [];
	const clients = new Set<Bun.ServerWebSocket<unknown>>();
	const server = Bun.serve({
		port,
		fetch(req, srv) {
			upgrades.push(new URL(req.url).pathname);
			if (srv.upgrade(req)) return;
			return new Response("no", { status: 400 });
		},
		websocket: {
			open(ws) {
				clients.add(ws);
			},
			close(ws) {
				clients.delete(ws);
			},
			message(_ws, data) {
				commands.push(JSON.parse(String(data)));
			},
		},
	});
	return {
		server,
		upgrades,
		commands,
		hostUrl: `http://localhost:${server.port}`,
		push(payload: object) {
			for (const ws of clients) ws.send(JSON.stringify(payload));
		},
		dropClients() {
			for (const ws of clients) ws.close();
		},
		clientCount: () => clients.size,
	};
}

function waitFor(cond: () => boolean, timeoutMs = 4_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const t = setInterval(() => {
			if (cond()) {
				clearInterval(t);
				resolve();
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(t);
				reject(new Error("waitFor timeout"));
			}
		}, 20);
	});
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const fn of cleanups.splice(0)) fn();
});

describe("eventBus", () => {
	it("routes events to listeners by type and workspaceId (exact and wildcard)", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		const exact: string[] = [];
		const wildcard: string[] = [];
		const other: string[] = [];
		cleanups.push(bus.on("git:changed", "ws-1", (id) => exact.push(id)));
		cleanups.push(bus.on("git:changed", "*", (id) => wildcard.push(id)));
		cleanups.push(bus.on("git:changed", "ws-2", (id) => other.push(id)));
		cleanups.push(() => host.server.stop(true));

		await waitFor(() => host.clientCount() === 1);
		host.push({ type: "git:changed", workspaceId: "ws-1", paths: ["a.ts"] });
		await waitFor(() => exact.length === 1 && wildcard.length === 1);
		expect(other.length).toBe(0);
	});

	it("shares one connection per hostUrl across handles", async () => {
		const host = makeHostServer();
		const busA = getEventBus(host.hostUrl, () => "tok");
		const busB = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(busA.on("git:changed", "*", () => {}));
		cleanups.push(busB.on("port:changed", "*", () => {}));
		cleanups.push(() => host.server.stop(true));

		await waitFor(() => host.clientCount() === 1);
		// Give a second dial a chance to appear if sharing were broken.
		await Bun.sleep(150);
		expect(host.upgrades.length).toBe(1);
	});

	it("refcounts fs:watch and only unwatches at zero", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(bus.on("fs:events", "*", () => {}));
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);

		bus.watchFs("ws-1");
		bus.watchFs("ws-1"); // second watcher: no duplicate command
		await waitFor(() => host.commands.length >= 1);
		await Bun.sleep(100);
		expect(host.commands).toEqual([{ type: "fs:watch", workspaceId: "ws-1" }]);

		bus.unwatchFs("ws-1"); // still one watcher left: no unwatch yet
		await Bun.sleep(100);
		expect(host.commands.length).toBe(1);

		bus.unwatchFs("ws-1");
		await waitFor(() => host.commands.length === 2);
		expect(host.commands[1]).toEqual({
			type: "fs:unwatch",
			workspaceId: "ws-1",
		});
	});

	it("re-sends active fs:watch commands after a reconnect", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(bus.on("fs:events", "*", () => {}));
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);

		bus.watchFs("ws-1");
		await waitFor(() => host.commands.length === 1);

		host.dropClients();
		// The wrapper reconnects (1s base delay) and the open handler replays
		// every active watch from state.
		await waitFor(() => host.commands.length === 2, 8_000);
		expect(host.commands[1]).toEqual({ type: "fs:watch", workspaceId: "ws-1" });
	});

	it("reconnectEventBusIfDown dials a downed connection without waiting out the backoff", async () => {
		const host = makeHostServer();
		const port = host.server.port;
		const bus = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(bus.on("git:changed", "*", () => {}));
		// stop() is idempotent, so registering it up front keeps a mid-test
		// failure from leaking the server into later tests.
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);

		host.server.stop(true);
		await waitFor(() => bus.getConnectionStatus().state !== "open");
		// Let the first automatic redial fail so the socket is sitting out a
		// grown backoff when the "service is back" signal arrives.
		await Bun.sleep(1_200);

		const revived = makeHostServer(port);
		cleanups.push(() => revived.server.stop(true));

		reconnectEventBusIfDown(host.hostUrl);
		await waitFor(() => revived.clientCount() === 1, 2_000);
		expect(bus.getConnectionStatus().state).toBe("open");
	});

	it("reconnectEventBusIfDown leaves an open connection alone", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(bus.on("git:changed", "*", () => {}));
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);

		reconnectEventBusIfDown(host.hostUrl);
		await Bun.sleep(200);
		expect(host.upgrades.length).toBe(1);
		expect(bus.getConnectionStatus().state).toBe("open");
	});

	it("closes the connection when the last listener unsubscribes", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		const off = bus.on("git:changed", "*", () => {});
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);

		off();
		await waitFor(() => host.clientCount() === 0);
		// And no zombie reconnect afterwards.
		await Bun.sleep(1_500);
		expect(host.clientCount()).toBe(0);
	});

	it("an active git-watch keeps the connection alive after its last listener/retainer releases", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		const off = bus.on("git:changed", "*", () => {});
		bus.watchGit("ws-1");
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);
		expect(host.upgrades.length).toBe(1);

		// Simulates a sibling effect's cleanup running first and releasing
		// this connection's only listener — a real, order-dependent scenario
		// in a multi-effect component (see DashboardSidebarWorkspaceStatus-
		// Provider: the listener-registration effect's cleanup runs before
		// the git-watch-release effect's, on full unmount). Before
		// maybeCleanupConnection() also checked the watch maps, this alone
		// would close the connection out from under still-active git-watch
		// interest.
		off();
		await Bun.sleep(300);
		expect(host.clientCount()).toBe(1);

		// The true last release, via a *fresh* getEventBus() call — matching
		// the real call site (getHostEventBus(hostUrl).unwatchGit(...), never
		// the same cached handle). Closes the same still-open connection
		// cleanly: no stray reconnect, and only the one upgrade ever occurs.
		getEventBus(host.hostUrl, () => "tok").unwatchGit("ws-1");
		await waitFor(() => host.clientCount() === 0);
		await Bun.sleep(300);
		expect(host.upgrades.length).toBe(1);
		expect(host.clientCount()).toBe(0);
	});

	it("releasing interest via a fresh handle, after the connection's last watcher already closed it, does not strand a new connection", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		bus.watchGit("ws-1");
		cleanups.push(() => host.server.stop(true));
		await waitFor(() => host.clientCount() === 1);
		expect(host.upgrades.length).toBe(1);

		// The true last release for this connection (no listeners/retainers
		// were ever added), so it should close now.
		bus.unwatchGit("ws-1");
		await waitFor(() => host.clientCount() === 0);

		// A redundant *fresh* getEventBus() call releasing the same interest
		// again (e.g. a duplicate cleanup) — matching the real call site
		// (getHostEventBus(hostUrl).unwatchGit(...), never the same cached
		// handle). getEventBus() unconditionally (re)creates a
		// ConnectionState if none exists; before this fix, nothing ever
		// closed the socket it opens back down (unwatchGit/unwatchFs never
		// called maybeCleanupConnection), so it would dial in and reconnect
		// forever (a second real upgrade hits the server, `host.upgrades.
		// length` reaches 2, and `clientCount()` gets stuck at 1).
		getEventBus(host.hostUrl, () => "tok").unwatchGit("ws-1");

		// With the fix, maybeCleanupConnection closes the fresh connection
		// synchronously — fast enough that it never even dials out. No
		// second upgrade ever reaches the server, and no client lingers.
		await Bun.sleep(1_500);
		expect(host.upgrades.length).toBe(1);
		expect(host.clientCount()).toBe(0);
	});

	it("a git:watch the host rejects for its cap is re-sent by the next watchGit", async () => {
		const host = makeHostServer();
		const bus = getEventBus(host.hostUrl, () => "tok");
		cleanups.push(bus.retain());
		cleanups.push(() => host.server.stop(true));
		const watchesFor = (workspaceId: string) =>
			host.commands.filter(
				(c) => c.type === "git:watch" && c.workspaceId === workspaceId,
			).length;

		bus.watchGit("ws-1");
		await waitFor(() => watchesFor("ws-1") === 1);

		// The host never registered it. Without dropping the local entry, the
		// refcount would suppress every later watchGit for this workspace and
		// its git:changed listeners would stay silent for the session.
		host.push({
			type: "error",
			code: "git-watch-cap",
			workspaceId: "ws-1",
			message: "Too many git watches for this client",
		});
		await Bun.sleep(150);

		bus.watchGit("ws-1");
		await waitFor(() => watchesFor("ws-1") === 2);
	});
});
