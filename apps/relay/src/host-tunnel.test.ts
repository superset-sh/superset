/// <reference types="bun" />
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";
import type { Connection } from "partyserver";

const { HostTunnel } = await import("./host-tunnel");

const settledNow = <T>(promise: Promise<T>) =>
	Promise.race([promise, Promise.resolve("still pending" as const)]);

function socket(id: string, kind: "host" | "client" | "dial") {
	return {
		id,
		tags: kind === "host" ? ["host"] : [],
		state: { kind, hostId: "org:host", ticket: "ticket" },
		readyState: WebSocket.OPEN,
		send: mock(() => {}),
		close: mock(() => {}),
	} as unknown as Connection;
}

function tunnelWith(connections: Connection[]) {
	const tunnel = new HostTunnel({} as never, {} as never);
	Object.assign(tunnel, { ctx: { storage: { put: async () => {} } } });
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

describe("a host that ignores a dial", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const httpRequest = {
		method: "POST",
		pathWithQuery: "/trpc/workspaceCreation.searchBranches",
		headers: {},
		body: new Uint8Array(),
	};

	function allowAll(tunnel: InstanceType<typeof HostTunnel>) {
		(tunnel as unknown as { authorize: () => Promise<string> }).authorize =
			async () => "allowed";
	}

	test("is closed, and its client streams with it", async () => {
		const host = socket("frozen", "host");
		const eventStream = socket("event-bus", "client");
		const tunnel = tunnelWith([host, eventStream]);
		allowAll(tunnel);

		const result = tunnel.proxyHttp({} as never, httpRequest);
		await Promise.resolve();
		jest.advanceTimersByTime(35_000);

		expect(await settledNow(result)).toEqual({ ok: false, reason: "timeout" });
		expect(host.close).toHaveBeenCalledWith(4408, "Host did not answer a dial");
		expect(eventStream.close).toHaveBeenCalledWith(4410, "Tunnel disconnected");
	});

	test("is kept when it still pings, as a host whose dial-back failed does", async () => {
		const host = socket("live", "host");
		const eventStream = socket("event-bus", "client");
		const tunnel = tunnelWith([host, eventStream]);
		allowAll(tunnel);

		const result = tunnel.proxyHttp({} as never, httpRequest);
		await Promise.resolve();
		jest.advanceTimersByTime(20_000);
		tunnel.onMessage(host, '{"type":"ping"}');
		jest.advanceTimersByTime(15_000);

		expect(await settledNow(result)).toEqual({ ok: false, reason: "timeout" });
		expect(host.close).not.toHaveBeenCalled();
		expect(eventStream.close).not.toHaveBeenCalled();
	});

	test("does not close a replacement that connected meanwhile", async () => {
		const frozen = socket("frozen", "host");
		const replacement = socket("replacement", "host");
		const connections = [frozen];
		const tunnel = tunnelWith(connections);
		allowAll(tunnel);

		const result = tunnel.proxyHttp({} as never, httpRequest);
		await Promise.resolve();
		connections.splice(0, 1, replacement);
		jest.advanceTimersByTime(35_000);

		expect(await settledNow(result)).toEqual({ ok: false, reason: "timeout" });
		expect(frozen.close).not.toHaveBeenCalled();
		expect(replacement.close).not.toHaveBeenCalled();
	});
});
