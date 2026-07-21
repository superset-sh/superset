import { afterEach, describe, expect, it } from "bun:test";
import {
	TerminalConnection,
	type TerminalConnectionState,
	type TerminalControlMessage,
} from "./TerminalConnection";

// Stands in for the relay + host-service PTY endpoint. Serves /_whoowns (200)
// and records every terminal WS dial's URL; `push`/`pushBinary` emit frames.
function makeRelayServer() {
	const dials: string[] = [];
	const clients = new Set<Bun.ServerWebSocket<unknown>>();
	const server = Bun.serve({
		port: 0,
		fetch(req, srv) {
			const url = new URL(req.url);
			if (url.pathname.endsWith("/_whoowns")) {
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
			dials.push(
				`${url.pathname}?${url.searchParams.toString()}`.replace(
					/token=[^&]*/,
					(m) => m, // keep token visible for assertions
				),
			);
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
			message() {},
		},
	});
	return {
		server,
		dials,
		relayUrl: `http://localhost:${server.port}`,
		push(payload: object) {
			for (const ws of clients) ws.send(JSON.stringify(payload));
		},
		pushBinary(bytes: Uint8Array) {
			for (const ws of clients) ws.send(bytes);
		},
		dropClients() {
			for (const ws of clients) ws.close();
		},
		clientCount: () => clients.size,
	};
}

function waitFor(cond: () => boolean, timeoutMs = 6_000): Promise<void> {
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

const TARGET = {
	workspaceId: "ws-1",
	terminalId: "term-1",
	routingKey: "org-1:machine-1",
};

let connection: TerminalConnection | null = null;
const cleanups: Array<() => void> = [];
afterEach(() => {
	connection?.dispose();
	connection = null;
	for (const fn of cleanups.splice(0)) fn();
});

function startConnection(relay: ReturnType<typeof makeRelayServer>) {
	const binaries: Uint8Array[] = [];
	const controls: TerminalControlMessage[] = [];
	const states: TerminalConnectionState[] = [];
	let tokenVersion = 0;
	connection = new TerminalConnection(
		TARGET,
		{
			onBinary: (b) => binaries.push(b),
			onControl: (m) => controls.push(m),
			onStateChange: (s) => states.push(s),
		},
		{
			getToken: async () => `tok-${++tokenVersion}`,
			relayUrl: () => relay.relayUrl,
		},
	);
	connection.start();
	return { binaries, controls, states };
}

describe("TerminalConnection", () => {
	it("dials the terminal path with workspace params and a token", async () => {
		const relay = makeRelayServer();
		cleanups.push(() => relay.server.stop(true));
		startConnection(relay);
		await waitFor(() => relay.dials.length === 1);
		const dial = relay.dials[0] ?? "";
		expect(dial).toContain("/hosts/org-1:machine-1/terminal/term-1");
		expect(dial).toContain("workspaceId=ws-1");
		expect(dial).toContain("token=tok-1");
		expect(dial).not.toContain("replay=0"); // first attach wants replay
	});

	it("delivers binary PTY bytes and control messages", async () => {
		const relay = makeRelayServer();
		cleanups.push(() => relay.server.stop(true));
		const { binaries, controls } = startConnection(relay);
		await waitFor(() => relay.clientCount() === 1);
		relay.push({ type: "attached", terminalId: "term-1" });
		relay.pushBinary(new Uint8Array([104, 105]));
		await waitFor(() => controls.length === 1 && binaries.length === 1);
		expect(controls[0]).toEqual({ type: "attached", terminalId: "term-1" });
		expect([...(binaries[0] ?? [])]).toEqual([104, 105]);
	});

	it("reconnects after a drop with a FRESH token and replay=0 once bytes were seen", async () => {
		const relay = makeRelayServer();
		cleanups.push(() => relay.server.stop(true));
		const { states } = startConnection(relay);
		await waitFor(() => relay.clientCount() === 1);
		relay.push({ type: "attached", terminalId: "term-1" });
		relay.pushBinary(new Uint8Array([104]));
		await waitFor(() => relay.dials.length === 1);

		relay.dropClients();
		await waitFor(() => relay.dials.length === 2);
		const redial = relay.dials[1] ?? "";
		expect(redial).toContain("token=tok-2"); // not the URL from attempt 1
		expect(redial).toContain("replay=0");
		expect(states).toContain("reconnecting");
	});

	it("stops permanently after a PTY exit", async () => {
		const relay = makeRelayServer();
		cleanups.push(() => relay.server.stop(true));
		const { controls } = startConnection(relay);
		await waitFor(() => relay.clientCount() === 1);
		relay.push({ type: "exit", exitCode: 0, signal: 0 });
		await waitFor(() => controls.length === 1);
		await waitFor(() => relay.clientCount() === 0);
		// No redial: the session is done.
		await Bun.sleep(1_200);
		expect(relay.dials.length).toBe(1);
	});
});
