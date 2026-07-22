import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { TunnelClient } from "./tunnel-client";

// Reproduces https://github.com/.../issues/5861
//
// The CLI prints "Connected to relay — machine is now accessible." as soon as
// the local host-service health check passes, but the relay WebSocket is
// established fire-and-forget and may never open (in the report, the relay
// answered every request with a Vercel `DEPLOYMENT_NOT_FOUND` 404, so the WS
// upgrade never succeeded). `TunnelClient` gave callers no way to observe
// whether the tunnel actually connected, so "connected" could never be an
// honest claim. These tests pin down that observable state.

let client: TunnelClient | null = null;
let server: Server | null = null;

afterEach(() => {
	client?.close();
	client = null;
	server?.stop(true);
	server = null;
});

function makeClient(relayUrl: string): TunnelClient {
	return new TunnelClient({
		relayUrl,
		hostId: "org-1:machine-1",
		getAuthToken: async () => "test-token",
		localPort: 1,
		hostServiceSecret: "secret",
	});
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 2_000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await new Promise((r) => setTimeout(r, 20));
	}
	return predicate();
}

describe("TunnelClient connection state", () => {
	test("does not report connected when the relay rejects the WS upgrade (DEPLOYMENT_NOT_FOUND)", async () => {
		// Relay stub that never upgrades — answers every request with a 404,
		// mirroring the Vercel DEPLOYMENT_NOT_FOUND response in the report.
		server = Bun.serve({
			port: 0,
			fetch: () =>
				new Response("DEPLOYMENT_NOT_FOUND", {
					status: 404,
					headers: { "x-vercel-error": "DEPLOYMENT_NOT_FOUND" },
				}),
		});

		client = makeClient(`http://127.0.0.1:${server.port}`);
		await client.connect();

		// Give the socket a chance to (fail to) open.
		await new Promise((r) => setTimeout(r, 200));

		expect(client.isConnected()).toBe(false);
	});

	test("reports connected once the relay accepts the WS upgrade", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req, srv) {
				if (srv.upgrade(req)) return;
				return new Response("expected websocket", { status: 426 });
			},
			websocket: {
				open() {},
				message() {},
			},
		});

		client = makeClient(`http://127.0.0.1:${server.port}`);
		await client.connect();

		expect(await waitFor(() => client?.isConnected() === true)).toBe(true);
	});
});
