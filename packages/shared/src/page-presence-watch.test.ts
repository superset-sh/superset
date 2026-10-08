import { describe, expect, test } from "bun:test";
import type { PagePresenceViewer } from "./page-presence";
import { openPresenceWatch } from "./page-presence-watch";

class FakeSocket {
	sent: string[] = [];
	closed = false;
	listeners = new Map<
		string,
		((event: { data?: unknown; code?: number }) => void)[]
	>();
	constructor(public url: string) {}
	addEventListener(
		type: string,
		listener: (event: { data?: unknown; code?: number }) => void,
	) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
	}
	emit(type: string, event: { data?: unknown; code?: number }) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
	hub(message: unknown) {
		this.emit("message", { data: JSON.stringify(message) });
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean) {
	for (let tries = 0; tries < 500 && !condition(); tries++) await sleep(1);
	expect(condition()).toBe(true);
}

function harness(
	options: { heartbeatMs?: number; tickets?: (string | null)[] } = {},
) {
	const sockets: FakeSocket[] = [];
	const seen: PagePresenceViewer[][] = [];
	const tickets = [...(options.tickets ?? [])];
	let dialled = 0;
	const watch = openPresenceWatch({
		url: async () => {
			dialled += 1;
			return tickets.length
				? (tickets.shift() ?? null)
				: `wss://hub/${dialled}`;
		},
		onViewers: (viewers) => seen.push(viewers),
		createSocket: (address) => {
			const socket = new FakeSocket(address);
			sockets.push(socket);
			return socket;
		},
		retryBaseMs: 1,
		heartbeatMs: options.heartbeatMs ?? 60_000,
	});
	return { watch, sockets, seen, dialled: () => dialled };
}

const grace = {
	id: "c2",
	userId: "u2",
	name: "Grace",
	image: null,
	guest: false,
	guestNumber: null,
	cursor: null,
};

describe("openPresenceWatch", () => {
	test("hands over the hub's viewer list, validated", async () => {
		const h = harness();
		await until(() => h.sockets.length === 1);
		h.sockets[0]?.hub({ type: "hello" });
		h.sockets[0]?.hub({ type: "presence", viewers: [grace, { id: 7 }] });
		expect(h.seen.at(-1)).toEqual([grace]);
		h.watch.stop();
	});

	test("a dropped socket clears the list and dials again with a fresh ticket", async () => {
		const h = harness();
		await until(() => h.sockets.length === 1);
		h.sockets[0]?.hub({ type: "presence", viewers: [grace] });
		h.sockets[0]?.emit("close", { code: 1006 });
		expect(h.seen.at(-1)).toEqual([]);
		await until(() => h.sockets.length === 2);
		expect(h.sockets[1]?.url).toBe("wss://hub/2");
		h.watch.stop();
	});

	test("a refused or full page is not dialled again", async () => {
		for (const code of [4403, 4429]) {
			const h = harness();
			await until(() => h.sockets.length === 1);
			h.sockets[0]?.emit("close", { code });
			await sleep(10);
			expect(h.sockets.length).toBe(1);
			h.watch.stop();
		}
	});

	test("no ticket means try again later, not give up", async () => {
		const h = harness({ tickets: [null, null] });
		await until(() => h.sockets.length === 1);
		expect(h.dialled()).toBe(3);
		h.watch.stop();
	});

	test("a socket that answered pings and then went quiet is replaced", async () => {
		const h = harness({ heartbeatMs: 2 });
		await until(() => h.sockets.length === 1);
		const first = h.sockets[0] as FakeSocket;
		first.hub({ type: "hello" });
		first.emit("message", { data: "pong" });
		await until(() => h.sockets.length === 2);
		expect(first.closed).toBe(true);
		h.watch.stop();
	});

	test("a hub that never answers pings is kept", async () => {
		const h = harness({ heartbeatMs: 2 });
		await until(() => h.sockets.length === 1);
		h.sockets[0]?.hub({ type: "hello" });
		await until(
			() => (h.sockets[0]?.sent.filter((s) => s === "ping").length ?? 0) >= 4,
		);
		expect(h.sockets.length).toBe(1);
		h.watch.stop();
	});

	test("stop closes the socket and dials no more", async () => {
		const h = harness();
		await until(() => h.sockets.length === 1);
		h.watch.stop();
		h.sockets[0]?.emit("close", { code: 1006 });
		await sleep(10);
		expect(h.sockets[0]?.closed).toBe(true);
		expect(h.sockets.length).toBe(1);
	});
});
