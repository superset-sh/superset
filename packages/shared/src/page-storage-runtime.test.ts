import { describe, expect, test } from "bun:test";
import { STORAGE_HOST_CHANNEL } from "./page-storage";
import { pageStorageRuntimeSource } from "./page-storage-runtime";

interface Storage {
	ready: Promise<boolean>;
	viewer: { userId: string; name: string; image: string | null } | null;
	author: boolean;
	writable: boolean | null;
	get(key: string): Promise<unknown>;
	getAll(key: string): Promise<unknown[]>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
	subscribe(key: string, onRecords: (records: unknown[]) => void): () => void;
}

interface Harness {
	storage: Storage;
	posted: Record<string, unknown>[];
	sent: Record<string, unknown>[];
	toFrame(body: Record<string, unknown>): void;
	fromHub(body: Record<string, unknown>): void;
	socketOpened: () => string | null;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function mount({ framed = true, helloTimeoutMs = 2000 } = {}): Harness {
	const posted: Record<string, unknown>[] = [];
	const sent: Record<string, unknown>[] = [];
	const listeners: ((event: unknown) => void)[] = [];
	const socketListeners = new Map<string, ((event: unknown) => void)[]>();
	let socketUrl: string | null = null;

	const win: Record<string, unknown> = {};
	const parent = framed
		? { postMessage: (m: Record<string, unknown>) => posted.push(m) }
		: win;

	class FakeSocket {
		readyState = 1;
		constructor(url: string) {
			socketUrl = url;
		}
		addEventListener(type: string, fn: (event: unknown) => void) {
			const fns = socketListeners.get(type) ?? [];
			fns.push(fn);
			socketListeners.set(type, fns);
		}
		send(payload: string) {
			sent.push(JSON.parse(payload));
		}
	}

	new Function(
		"window",
		"parent",
		"addEventListener",
		"removeEventListener",
		"document",
		"WebSocket",
		pageStorageRuntimeSource({ helloTimeoutMs }),
	)(
		win,
		parent,
		(type: string, fn: (event: unknown) => void) => {
			if (type === "message") listeners.push(fn);
		},
		() => {},
		{ visibilityState: "visible" },
		FakeSocket,
	);

	const superset = win.superset as { storage: Storage };
	return {
		storage: superset.storage,
		posted,
		sent,
		toFrame(body) {
			const event = {
				data: { channel: STORAGE_HOST_CHANNEL, ...body },
				source: parent,
			};
			for (const fn of [...listeners]) fn(event);
		},
		fromHub(body) {
			for (const fn of socketListeners.get("message") ?? []) {
				fn({ data: JSON.stringify(body) });
			}
		},
		socketOpened: () => socketUrl,
	};
}

const lastCall = (sent: Record<string, unknown>[]) =>
	sent.filter((m) => m.type === "call").at(-1);

describe("page storage runtime, socket path", () => {
	test("asks the host for a connection, then opens the socket it is given", async () => {
		const h = mount();
		expect(h.posted.some((m) => m.type === "hello")).toBe(true);

		h.toFrame({ type: "connect", url: "wss://realtime/socket?ticket=t" });
		expect(h.socketOpened()).toBe("wss://realtime/socket?ticket=t");

		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: true,
			writable: true,
		});
		expect(await h.storage.ready).toBe(true);
		expect(h.storage.viewer).toEqual({
			userId: "u1",
			name: "Ada",
			image: null,
		});
		expect(h.storage.author).toBe(true);
		expect(h.storage.writable).toBe(true);
	});

	test("calls go down the socket, not to the host", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await h.storage.ready;

		const before = h.posted.length;
		const pending = h.storage.getAll("votes");
		await flush();
		expect(lastCall(h.sent)?.request).toEqual({ op: "getAll", key: "votes" });
		expect(h.posted.length).toBe(before);

		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [{ value: "Ramen" }] },
		});
		expect(await pending).toEqual([{ value: "Ramen" }]);
	});

	test("a pushed record set reaches a subscriber with no extra read", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await h.storage.ready;

		const seen: unknown[][] = [];
		h.storage.subscribe("votes", (records) => seen.push(records));
		await flush();
		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [] },
		});
		await flush();

		const before = h.sent.filter((m) => m.type === "call").length;
		h.fromHub({
			type: "records",
			key: "votes",
			records: [{ value: "Tacos" }, { value: "Pizza" }],
		});
		await flush();
		expect(seen.at(-1)).toHaveLength(2);
		expect(h.sent.filter((m) => m.type === "call").length).toBe(before);
	});

	test("revoked is terminal: later calls reject with it, not as unavailable", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await h.storage.ready;

		h.fromHub({ type: "revoked" });
		await expect(h.storage.get("votes")).rejects.toMatchObject({
			code: "revoked",
		});
	});

	test("carries the hub's code through to the page", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await h.storage.ready;

		const pending = h.storage.set("votes", "Tacos");
		await flush();
		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: false,
			code: "rate_limited",
			message: "slow down",
		});
		await expect(pending).rejects.toMatchObject({ code: "rate_limited" });
	});
});

describe("page storage runtime, a host that answers late", () => {
	test("a connection after the deadline still works, instead of failing forever", async () => {
		const h = mount({ helloTimeoutMs: 20 });
		// The handshake window passes with no answer, which is what a slow
		// hydration looks like to the page.
		expect(await h.storage.ready).toBe(false);
		await expect(h.storage.get("votes")).rejects.toMatchObject({
			code: "unavailable",
		});

		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await flush();

		const pending = h.storage.getAll("votes");
		await flush();
		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [{ value: "Ramen" }] },
		});
		expect(await pending).toEqual([{ value: "Ramen" }]);
	});

	test("a subscriber that failed before the host arrived re-reads", async () => {
		const h = mount({ helloTimeoutMs: 20 });
		await h.storage.ready;

		const seen: unknown[][] = [];
		h.storage.subscribe("votes", (records) => seen.push(records));
		await flush();
		expect(seen).toHaveLength(0);

		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await flush();
		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [{ value: "Tacos" }] },
		});
		await flush();
		expect(seen.at(-1)).toEqual([{ value: "Tacos" }]);
	});
});

describe("page storage runtime, no host", () => {
	test("settles unavailable rather than hanging", async () => {
		const h = mount({ framed: false, helloTimeoutMs: 20 });
		expect(await h.storage.ready).toBe(false);
		await expect(h.storage.get("k")).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	test("refuses a value JSON cannot represent before posting it", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		h.fromHub({
			type: "hello",
			viewer: { userId: "u1", name: "Ada", image: null },
			author: false,
			writable: true,
		});
		await h.storage.ready;

		const before = h.sent.length;
		await expect(h.storage.set("k", () => 1)).rejects.toMatchObject({
			code: "invalid",
		});
		expect(h.sent.length).toBe(before);
	});
});
