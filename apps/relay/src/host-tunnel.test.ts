/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import type { Connection } from "partyserver";

mock.module("partyserver", () => ({ Server: class {} }));

const { HostTunnel } = await import("./host-tunnel");

function socket(id: string, kind: "host" | "client" | "dial") {
	return {
		id,
		tags: kind === "host" ? ["host"] : [],
		state: { kind, hostId: "org:host", ticket: "ticket" },
		readyState: WebSocket.OPEN,
		close: mock(() => {}),
	} as unknown as Connection;
}

function tunnelWith(connections: Connection[]) {
	const tunnel = new HostTunnel({} as never, {} as never);
	tunnel.getConnections = ((tag?: string) =>
		connections
			.filter((conn) => !tag || conn.tags.includes(tag))
			.values()) as typeof tunnel.getConnections;
	return tunnel;
}

test("a delayed old control close preserves streams on the replacement tunnel", async () => {
	const oldHost = socket("old", "host");
	const replacement = socket("replacement", "host");
	const client = socket("terminal", "client");
	const dial = socket("terminal-dial", "dial");
	const tunnel = tunnelWith([replacement, client, dial]);

	await tunnel.onClose(oldHost);
	await tunnel.onError(oldHost);

	expect(client.close).not.toHaveBeenCalled();
	expect(dial.close).not.toHaveBeenCalled();
});

test("losing the current control connection still closes its streams", async () => {
	const host = socket("current", "host");
	const client = socket("terminal", "client");
	const dial = socket("terminal-dial", "dial");
	const tunnel = tunnelWith([client, dial]);

	await tunnel.onClose(host);

	expect(client.close).toHaveBeenCalledTimes(1);
	expect(dial.close).toHaveBeenCalledTimes(1);
});
