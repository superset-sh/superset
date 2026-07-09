import { expect, test } from "bun:test";
import { createProxyBridge, internalProxyUrl, safeCloseCode } from "./proxy";

function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const tick = () => {
			if (cond()) return resolve();
			if (Date.now() - started > timeoutMs)
				return reject(new Error("waitFor timed out"));
			setTimeout(tick, 10);
		};
		tick();
	});
}

type FakeClient = {
	readyState: number;
	send: (d: string | ArrayBuffer) => void;
	close: (code?: number, reason?: string) => void;
};

test("closes the client with 1011 when the upstream never finishes opening", async () => {
	// Accepts the connect but never fires "open" (dead-but-in-DNS peer).
	const stalledUpstream = {
		binaryType: "",
		readyState: 0,
		addEventListener: () => {},
		send: () => {},
		close: () => {},
	} as unknown as WebSocket;

	let closedCode: number | undefined;
	const client: FakeClient = {
		readyState: 1,
		send: () => {},
		close: (code) => {
			closedCode = code;
		},
	};

	const bridge = createProxyBridge("ws://unused/", () => stalledUpstream, 20);
	bridge.onOpen(null, client as never);

	await waitFor(() => closedCode !== undefined);
	expect(closedCode).toBe(1011);
});

test("internalProxyUrl targets the owner machine over 6PN with the loop guard", () => {
	const url = internalProxyUrl(
		{ machineId: "abc123" },
		"org:host",
		"/terminal/t1",
		"?token=x&workspaceId=w",
		{ appName: "superset-relay", port: 8080 },
	);
	expect(url).toBe(
		"ws://abc123.vm.superset-relay.internal:8080/hosts/org:host/terminal/t1?token=x&workspaceId=w&_rlp=1",
	);
	// No prior query → the guard opens with `?`.
	expect(
		internalProxyUrl({ machineId: "m" }, "h", "/events", "", {
			appName: "app",
			port: 80,
		}),
	).toBe("ws://m.vm.app.internal:80/hosts/h/events?_rlp=1");
});

test("safeCloseCode preserves sendable codes and only remaps unsendable ones", () => {
	expect(safeCloseCode(1000)).toBe(1000);
	expect(safeCloseCode(1001)).toBe(1001);
	expect(safeCloseCode(1011)).toBe(1011);
	expect(safeCloseCode(4001)).toBe(4001);
	// Unsendable / missing codes collapse to 1011, never 1000.
	expect(safeCloseCode(1006)).toBe(1011);
	expect(safeCloseCode(1005)).toBe(1011);
	expect(safeCloseCode(1015)).toBe(1011);
	expect(safeCloseCode(undefined)).toBe(1011);
});

test("bridge pipes client→upstream text and upstream→client binary (framing preserved)", async () => {
	const receivedByUpstream: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(req, s) {
			if (s.upgrade(req)) return undefined;
			return new Response("expected ws", { status: 400 });
		},
		websocket: {
			message(ws, msg) {
				receivedByUpstream.push(String(msg));
				// Echo back binary PTY-style bytes to exercise the binary path.
				ws.send(new Uint8Array([1, 2, 3, 4]));
			},
		},
	});

	const clientSent: (string | ArrayBuffer)[] = [];
	const client: FakeClient = {
		readyState: 1,
		send: (d) => clientSent.push(d),
		close: () => {},
	};

	const bridge = createProxyBridge(`ws://localhost:${server.port}/`);
	bridge.onOpen(null, client as never);
	// Sent before the upstream is open → must be buffered then flushed on open.
	bridge.onMessage({ data: "echo probe-ok\r" });

	await waitFor(() => receivedByUpstream.length > 0);
	expect(receivedByUpstream).toContain("echo probe-ok\r");

	await waitFor(() => clientSent.some((d) => d instanceof ArrayBuffer));
	const binary = clientSent.find(
		(d) => d instanceof ArrayBuffer,
	) as ArrayBuffer;
	expect(Array.from(new Uint8Array(binary))).toEqual([1, 2, 3, 4]);

	server.stop(true);
});

test("bridge propagates an upstream close to the client with a safe code", async () => {
	const server = Bun.serve({
		port: 0,
		fetch(req, s) {
			if (s.upgrade(req)) return undefined;
			return new Response("expected ws", { status: 400 });
		},
		websocket: {
			open(ws) {
				ws.close(4001, "drain");
			},
			message() {},
		},
	});

	let closedCode: number | undefined;
	const client: FakeClient = {
		readyState: 1,
		send: () => {},
		close: (code) => {
			closedCode = code;
		},
	};

	const bridge = createProxyBridge(`ws://localhost:${server.port}/`);
	bridge.onOpen(null, client as never);

	await waitFor(() => closedCode !== undefined);
	expect(closedCode).toBe(4001);

	server.stop(true);
});
