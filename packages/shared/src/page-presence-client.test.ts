import { describe, expect, test } from "bun:test";
import type { PagePresenceViewer } from "./page-presence";
import { openPagePresence } from "./page-presence-client";

type Event = { data?: unknown; code?: number };

class FakeSocket {
	sent: string[] = [];
	closed = false;
	listeners = new Map<string, ((event: Event) => void)[]>();
	constructor(public url: string) {}
	addEventListener(type: string, listener: (event: Event) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
	}
	emit(type: string, event: Event = {}) {
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
	options: { heartbeatMs?: number; urls?: (string | null)[] } = {},
) {
	const sockets: FakeSocket[] = [];
	const states: PagePresenceViewer[][] = [];
	const urls = [...(options.urls ?? [])];
	let dialled = 0;
	const client = openPagePresence({
		url: async () => {
			dialled += 1;
			return urls.length ? (urls.shift() ?? null) : `wss://hub/${dialled}`;
		},
		onViewers: (viewers) => states.push(viewers),
		createSocket: (address) => {
			const socket = new FakeSocket(address);
			sockets.push(socket);
			return socket;
		},
		retryBaseMs: 1,
		heartbeatMs: options.heartbeatMs ?? 60_000,
	});
	const opened = async () => {
		await until(() => sockets.length > 0);
		const socket = sockets.at(-1) as FakeSocket;
		socket.emit("open");
		return socket;
	};
	return { client, sockets, states, opened, dialled: () => dialled };
}

const grace = {
	id: "c2",
	key: "k2",
	name: "Grace",
	image: null,
	guest: false,
	guestNumber: null,
	color: 1,
};

describe("openPagePresence", () => {
	test("takes the viewer list from the hub, validated", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace, { id: 7 }] });
		expect(h.states.at(-1)).toEqual([grace]);
		h.client.stop();
	});

	test("a dropped socket clears everyone and dials again with a fresh url", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace] });
		socket.emit("close", { code: 1006 });
		expect(h.states.at(-1)).toEqual([]);
		await until(() => h.sockets.length === 2);
		expect(h.sockets[1]?.url).toBe("wss://hub/2");
		h.client.stop();
	});

	test("a refused or full page is not dialled again", async () => {
		for (const code of [4403, 4429]) {
			const h = harness();
			const socket = await h.opened();
			socket.emit("close", { code });
			await sleep(10);
			expect(h.sockets.length).toBe(1);
			h.client.stop();
		}
	});

	test("no url yet means try again later", async () => {
		const h = harness({ urls: [null, null] });
		await until(() => h.sockets.length === 1);
		expect(h.dialled()).toBe(3);
		h.client.stop();
	});

	test("a socket that answered pings and then went quiet is replaced", async () => {
		const h = harness({ heartbeatMs: 2 });
		const socket = await h.opened();
		socket.emit("message", { data: "pong" });
		await until(() => h.sockets.length === 2);
		expect(socket.closed).toBe(true);
		h.client.stop();
	});

	test("a hub that never answers pings is kept", async () => {
		const h = harness({ heartbeatMs: 2 });
		const socket = await h.opened();
		await until(() => socket.sent.filter((s) => s === "ping").length >= 4);
		expect(h.sockets.length).toBe(1);
		h.client.stop();
	});

	test("stop closes the socket and dials no more", async () => {
		const h = harness();
		const socket = await h.opened();
		h.client.stop();
		socket.emit("close", { code: 1006 });
		await sleep(10);
		expect(socket.closed).toBe(true);
		expect(h.sockets.length).toBe(1);
	});
});
