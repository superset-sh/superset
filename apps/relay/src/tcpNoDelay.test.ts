import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { enableTcpNoDelay } from "./tcpNoDelay";

// Observe whether the accepted server-side socket had `setNoDelay(true)` called
// on it. There is no public getter for a socket's noDelay flag, so we register a
// connection listener that wraps `setNoDelay` with a spy. Listeners fire in
// registration order, so installing the spy before the code under test means
// the spy is in place when `enableTcpNoDelay`'s listener runs.
//
// The connection is driven with a real HTTP request: under Bun, an http.Server
// only emits 'connection' once it sees actual HTTP bytes, not on a bare TCP
// open.
async function captureNoDelay(
	wireUp: (server: Server) => void,
): Promise<boolean> {
	const server = createServer((_req, res) => res.end("ok"));
	let calledWithTrue = false;

	server.on("connection", (socket: Socket) => {
		const original = socket.setNoDelay.bind(socket);
		socket.setNoDelay = (noDelay?: boolean) => {
			if (noDelay !== false) calledWithTrue = true;
			return original(noDelay);
		};
	});

	wireUp(server);

	try {
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const { port } = server.address() as AddressInfo;
		const res = await fetch(`http://127.0.0.1:${port}/`);
		await res.text();
		// Let the server's 'connection' event fire.
		await new Promise((resolve) => setTimeout(resolve, 50));
		return calledWithTrue;
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

describe("relay TCP_NODELAY", () => {
	// Reproduces #5012: the relay never disabled Nagle's algorithm, so sparse
	// interactive (keystroke) traffic was held by Nagle/delayed-ACK and lagged
	// 1–3s per keystroke on remote terminals. Baseline: a plain server does NOT
	// set TCP_NODELAY on accepted sockets.
	test("baseline: a server without the fix leaves Nagle's algorithm on", async () => {
		const calledWithTrue = await captureNoDelay(() => {
			// no-op: mirrors the relay before the fix
		});
		expect(calledWithTrue).toBe(false);
	});

	// The fix: enableTcpNoDelay sets setNoDelay(true) on every accepted socket.
	test("enableTcpNoDelay sets TCP_NODELAY on incoming sockets", async () => {
		const calledWithTrue = await captureNoDelay((server) => {
			enableTcpNoDelay(server);
		});
		expect(calledWithTrue).toBe(true);
	});
});
