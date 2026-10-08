import { describe, expect, test } from "bun:test";
import {
	openPagePresence,
	type PagePresenceState,
} from "./page-presence-client";

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
	cursors() {
		return this.sent
			.filter((data) => data !== "ping")
			.map((data) => JSON.parse(data).cursor);
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean) {
	for (let tries = 0; tries < 500 && !condition(); tries++) await sleep(1);
	expect(condition()).toBe(true);
}

function harness(
	options: {
		heartbeatMs?: number;
		cursorIntervalMs?: number;
		urls?: (string | null)[];
	} = {},
) {
	const sockets: FakeSocket[] = [];
	const states: PagePresenceState[] = [];
	const urls = [...(options.urls ?? [])];
	let dialled = 0;
	const client = openPagePresence({
		url: async () => {
			dialled += 1;
			return urls.length ? (urls.shift() ?? null) : `wss://hub/${dialled}`;
		},
		onChange: (state) => states.push(state),
		createSocket: (address) => {
			const socket = new FakeSocket(address);
			sockets.push(socket);
			return socket;
		},
		retryBaseMs: 1,
		heartbeatMs: options.heartbeatMs ?? 60_000,
		cursorIntervalMs: options.cursorIntervalMs ?? 0,
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
	userId: "u2",
	name: "Grace",
	image: null,
	guest: false,
	guestNumber: null,
	cursor: { path: "main:nth-of-type(1)", x: 0.5, y: 0.5 },
};

describe("openPagePresence", () => {
	test("takes viewers and their current cursors from the hub's list", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace, { id: 7 }] });
		const state = h.states.at(-1);
		expect(state?.viewers).toEqual([grace]);
		expect(state?.cursors.get("c2")).toEqual(grace.cursor);
		h.client.stop();
	});

	test("applies cursor moves and hides, and ignores a malformed one", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [{ ...grace, cursor: null }] });
		socket.hub({ type: "cursor", id: "c2", cursor: { path: "", x: 2, y: 0 } });
		expect(h.states.at(-1)?.cursors.get("c2")).toEqual({
			path: "",
			x: 1,
			y: 0,
		});
		const count = h.states.length;
		socket.hub({
			type: "cursor",
			id: "c2",
			cursor: { path: "div, *", x: 0, y: 0 },
		});
		expect(h.states.length).toBe(count);
		socket.hub({ type: "cursor", id: "c2", cursor: null });
		expect(h.states.at(-1)?.cursors.has("c2")).toBe(false);
		h.client.stop();
	});

	test("sends this viewer's cursor once open, dropping repeats", async () => {
		const h = harness();
		const cursor = { path: "", x: 0.1, y: 0.2 };
		h.client.setCursor(cursor);
		const socket = await h.opened();
		await until(() => socket.cursors().length === 1);
		h.client.setCursor(cursor);
		h.client.setCursor(null);
		await until(() => socket.cursors().length === 2);
		expect(socket.cursors()).toEqual([cursor, null]);
		h.client.stop();
	});

	test("throttles cursor sends to the latest position", async () => {
		const h = harness({ cursorIntervalMs: 30 });
		const socket = await h.opened();
		h.client.setCursor({ path: "", x: 0.1, y: 0 });
		await until(() => socket.cursors().length === 1);
		for (const x of [0.2, 0.3, 0.4]) h.client.setCursor({ path: "", x, y: 0 });
		await until(() => socket.cursors().length === 2);
		expect(socket.cursors()[1]).toEqual({ path: "", x: 0.4, y: 0 });
		h.client.stop();
	});

	test("a dropped socket clears everyone and dials again with a fresh url", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace] });
		socket.emit("close", { code: 1006 });
		expect(h.states.at(-1)?.viewers).toEqual([]);
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
