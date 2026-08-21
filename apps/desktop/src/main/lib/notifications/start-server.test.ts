import { describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import express from "express";
import { startNotificationsServer } from "./start-server";

const HOST = "127.0.0.1";

/** Binds a throwaway server and resolves with the port it grabbed. */
function occupyPort(): Promise<{ server: Server; port: number }> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, HOST, () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolve({ server, port: address.port });
			} else {
				reject(new Error("no port"));
			}
		});
	});
}

function close(server: Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

describe("notifications/start-server", () => {
	// Reproduction of #4133: the old inline `app.listen(port, host, cb)` never
	// attached an `error` listener, so an EADDRINUSE from a busy/orphan port was
	// an unhandled `error` event that silently killed the notifications server.
	it("reproduces the silent failure: a bare listen has no error handler for EADDRINUSE", async () => {
		const { server: occupied, port } = await occupyPort();

		const app = express();
		const server = app.listen(port, HOST);

		// Capture the error ourselves so it doesn't crash the test runner — this
		// mirrors what production code should have been doing but wasn't.
		const err = await new Promise<NodeJS.ErrnoException>((resolve) => {
			server.once("error", resolve);
		});

		// The port-in-use condition really does surface as EADDRINUSE...
		expect(err.code).toBe("EADDRINUSE");
		// ...and in the old code path nothing was listening for it (after our
		// one-shot `once` fired, there is no remaining handler), so Node would
		// have thrown and torn down the server for the rest of the session.
		expect(server.listeners("error").length).toBe(0);

		server.close();
		await close(occupied);
	});

	// The fix: startNotificationsServer attaches an error handler, so EADDRINUSE
	// is surfaced via onError instead of crashing, and onListening never fires.
	it("surfaces EADDRINUSE via onError instead of throwing", async () => {
		const { server: occupied, port } = await occupyPort();

		let listeningPort: number | undefined;
		const errorPromise = new Promise<NodeJS.ErrnoException>((resolve) => {
			startNotificationsServer({
				app: express(),
				port,
				host: HOST,
				onListening: (p) => {
					listeningPort = p;
				},
				onError: resolve,
			});
		});

		const err = await errorPromise;
		expect(err.code).toBe("EADDRINUSE");
		expect(listeningPort).toBeUndefined();

		await close(occupied);
	});

	// On a free port the server binds normally and reports the port.
	it("invokes onListening with the bound port when the port is free", async () => {
		const { server: occupied, port } = await occupyPort();
		// Free the port, then bind our own server to it.
		await close(occupied);

		const server = await new Promise<Server>((resolve, reject) => {
			const s = startNotificationsServer({
				app: express(),
				port,
				host: HOST,
				onListening: () => resolve(s),
				onError: reject,
			});
		});

		expect(server.listening).toBe(true);
		await close(server);
	});
});
