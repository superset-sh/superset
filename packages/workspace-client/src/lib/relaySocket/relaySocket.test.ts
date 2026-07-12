import { afterEach, describe, expect, it } from "bun:test";
import { createRelaySocket, type RelaySocket } from "./relaySocket";

// Local WS server whose /hosts/:id/_whoowns preflight status is scriptable.
function makeServer(getWhoownsStatus: () => number) {
	const tokensSeen: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(req, srv) {
			const url = new URL(req.url);
			if (url.pathname.endsWith("/_whoowns")) {
				return new Response(
					getWhoownsStatus() === 200 ? JSON.stringify({ ok: true }) : "{}",
					{ status: getWhoownsStatus() },
				);
			}
			tokensSeen.push(url.searchParams.get("token") ?? "");
			if (srv.upgrade(req)) return;
			return new Response("no", { status: 400 });
		},
		websocket: {
			open(ws) {
				ws.send("hello");
			},
			message() {},
		},
	});
	return { server, tokensSeen, port: server.port };
}

const HOST_PATH = "/hosts/org-1:machine-1/events";
let socket: RelaySocket | null = null;

afterEach(() => {
	socket?.close();
	socket = null;
});

function waitFor(cond: () => boolean, timeoutMs = 3_000): Promise<void> {
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

describe("createRelaySocket", () => {
	it("signs every attempt with a fresh token", async () => {
		const { server, tokensSeen, port } = makeServer(() => 200);
		let tokenVersion = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => `tok-${++tokenVersion}`,
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => tokensSeen.length >= 1);
		// Force a reconnect; the next dial must carry a NEW token.
		socket.reconnect();
		await waitFor(() => tokensSeen.length >= 2);
		expect(tokensSeen[0]).toBe("tok-1");
		expect(tokensSeen[1]).not.toBe(tokensSeen[0]);
		server.stop(true);
	});

	it("closes permanently and reports on preflight 403", async () => {
		const { server, tokensSeen, port } = makeServer(() => 403);
		let denied = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			onAccessDenied: () => denied++,
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => denied === 1);
		await Bun.sleep(200);
		expect(denied).toBe(1); // no retry loop after fatal close
		expect(tokensSeen.length).toBe(0); // never dialed the WS
		expect(socket.readyState).toBe(3); // CLOSED
		server.stop(true);
	});

	it("keeps re-probing at accessDeniedRetryMs and recovers when access is granted", async () => {
		let status = 403;
		const { server, tokensSeen, port } = makeServer(() => status);
		let denied = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			onAccessDenied: () => denied++,
			accessDeniedRetryMs: 50,
			minReconnectionDelay: 10,
			maxReconnectionDelay: 20,
		});
		await waitFor(() => denied >= 2); // still polling, not closed
		status = 200; // access granted
		await waitFor(() => tokensSeen.length >= 1);
		expect(socket.readyState).toBeLessThanOrEqual(1); // CONNECTING or OPEN
		server.stop(true);
	});

	it("dials local (non-/hosts) URLs without a preflight, converting http to ws", async () => {
		const { server, tokensSeen, port } = makeServer(() => 503);
		socket = createRelaySocket({
			buildUrl: () => `http://localhost:${port}/events`,
			getToken: () => "psk-1",
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => tokensSeen.length >= 1);
		expect(tokensSeen[0]).toBe("psk-1");
		server.stop(true);
	});
});
