import { describe, expect, test } from "bun:test";
import { PAGE_STORAGE_HOST_FLAG, STORAGE_HOST_CHANNEL } from "./page-storage";
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
	dispatch(type: string, event: Record<string, unknown>): void;
	closeSocket(code?: number): void;
	nextFrame(): void;
	socketOpened: () => string | null;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function mount({
	framed = true,
	webView = false,
	helloTimeoutMs = 2000,
	cursorIntervalMs = 0,
	retryBaseMs = 1,
	heartbeatMs = 60_000,
	answerPings = false,
	document = { visibilityState: "visible" } as Record<string, unknown>,
} = {}): Harness {
	const posted: Record<string, unknown>[] = [];
	const sent: Record<string, unknown>[] = [];
	const listeners = new Map<string, ((event: unknown) => void)[]>();
	const frames: (() => void)[] = [];
	let socketListeners = new Map<string, ((event: unknown) => void)[]>();
	let socketUrl: string | null = null;

	const win: Record<string, unknown> = webView
		? {
				[PAGE_STORAGE_HOST_FLAG]: true,
				postMessage: (m: Record<string, unknown>) => posted.push(m),
			}
		: {};
	const parent = framed
		? { postMessage: (m: Record<string, unknown>) => posted.push(m) }
		: win;

	class FakeSocket {
		readyState = 1;
		constructor(url: string) {
			socketUrl = url;
			socketListeners = new Map();
		}
		addEventListener(type: string, fn: (event: unknown) => void) {
			const fns = socketListeners.get(type) ?? [];
			fns.push(fn);
			socketListeners.set(type, fns);
		}
		send(payload: string) {
			sent.push(payload === "ping" ? { type: "ping" } : JSON.parse(payload));
			if (payload === "ping" && answerPings) {
				for (const fn of socketListeners.get("message") ?? []) {
					fn({ data: "pong" });
				}
			}
		}
		close() {}
	}

	new Function(
		"window",
		"parent",
		"addEventListener",
		"removeEventListener",
		"document",
		"WebSocket",
		"requestAnimationFrame",
		pageStorageRuntimeSource({
			helloTimeoutMs,
			cursorIntervalMs,
			retryBaseMs,
			heartbeatMs,
		}),
	)(
		win,
		parent,
		(type: string, fn: (event: unknown) => void) => {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		() => {},
		document,
		FakeSocket,
		(fn: () => void) => frames.push(fn),
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
			for (const fn of [...(listeners.get("message") ?? [])]) fn(event);
		},
		fromHub(body) {
			for (const fn of socketListeners.get("message") ?? []) {
				fn({ data: JSON.stringify(body) });
			}
		},
		dispatch(type, event) {
			for (const fn of listeners.get(type) ?? []) fn(event);
		},
		closeSocket(code = 1006) {
			for (const fn of socketListeners.get("close") ?? []) fn({ code });
		},
		nextFrame() {
			for (const fn of frames.splice(0)) fn();
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

describe("page storage runtime, a native WebView host", () => {
	test("a top-level page with the host flag still asks for a connection", () => {
		const h = mount({ framed: false, webView: true });
		expect(h.posted.some((m) => m.type === "hello")).toBe(true);
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		expect(h.socketOpened()).toBe("wss://realtime/socket");
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

function pageDocument() {
	const body = { nodeType: 1 };
	const root = {
		getBoundingClientRect: () => ({
			left: 0,
			top: -40,
			width: 800,
			height: 2000,
		}),
	};
	const section = {
		nodeType: 1,
		tagName: "SECTION",
		parentElement: body,
		previousElementSibling: null,
		isConnected: true,
		getBoundingClientRect: () => ({
			left: 100,
			top: 50,
			width: 200,
			height: 100,
		}),
	};
	Object.assign(body, {
		querySelector: (selector: string) =>
			selector === ":scope > section:nth-of-type(1)" ? section : null,
	});
	return {
		visibilityState: "visible",
		body,
		documentElement: root,
		elementFromPoint: (x: number, y: number) =>
			x >= 100 && x <= 300 && y >= 50 && y <= 150 ? section : root,
	};
}

function connected(guest = false) {
	const h = mount({ document: pageDocument() });
	h.toFrame({ type: "connect", url: "wss://realtime/socket" });
	h.fromHub({
		type: "hello",
		viewer: { userId: "u1", name: "Ada", image: null },
		author: false,
		writable: !guest,
		guest,
	});
	return h;
}

const lastPosted = (h: Harness, type: string) =>
	h.posted.filter((m) => m.type === type).at(-1);

describe("page storage runtime, presence", () => {
	test("a guest keeps storage unavailable but still hears who is here", async () => {
		const h = connected(true);
		expect(await h.storage.ready).toBe(false);
		expect(h.storage.viewer).toBeNull();

		const viewers = [
			{
				id: "c2",
				userId: "u2",
				name: "Grace",
				image: null,
				guest: false,
				cursor: null,
			},
		];
		h.fromHub({ type: "presence", viewers });
		expect(lastPosted(h, "presence")?.viewers).toEqual(viewers);
	});

	test("sends the pointer as a fraction of the element under it", async () => {
		const h = connected();
		h.dispatch("pointermove", {
			pointerType: "mouse",
			clientX: 150,
			clientY: 75,
		});
		await flush();
		expect(h.sent.filter((m) => m.type === "cursor").at(-1)).toEqual({
			type: "cursor",
			cursor: { path: "section:nth-of-type(1)", x: 0.25, y: 0.25 },
		});

		h.dispatch("pointermove", {
			pointerType: "mouse",
			clientX: 400,
			clientY: 40,
		});
		await flush();
		expect(h.sent.filter((m) => m.type === "cursor").at(-1)).toEqual({
			type: "cursor",
			cursor: { path: "", x: 0.5, y: 0.04 },
		});
	});

	test("touch never sends a cursor", async () => {
		const h = connected();
		h.dispatch("pointermove", {
			pointerType: "touch",
			clientX: 150,
			clientY: 75,
		});
		await flush();
		expect(h.sent.some((m) => m.type === "cursor")).toBe(false);
	});

	test("places another viewer's cursor in this frame's coordinates", () => {
		const h = connected();
		h.fromHub({
			type: "cursor",
			id: "c2",
			cursor: { path: "section:nth-of-type(1)", x: 0.5, y: 0.5 },
		});
		h.nextFrame();
		expect(lastPosted(h, "cursors")?.cursors).toEqual([
			{ id: "c2", x: 200, y: 100 },
		]);

		h.fromHub({ type: "cursor", id: "c2", cursor: null });
		h.nextFrame();
		expect(lastPosted(h, "cursors")?.cursors).toEqual([]);
	});

	test("a closed socket clears everyone from the host", () => {
		const h = connected();
		h.fromHub({
			type: "presence",
			viewers: [
				{
					id: "c2",
					userId: "u2",
					name: "Grace",
					image: null,
					guest: false,
					cursor: { path: "", x: 0, y: 0 },
				},
			],
		});
		h.closeSocket();
		expect(lastPosted(h, "presence")?.viewers).toEqual([]);
		expect(lastPosted(h, "cursors")?.cursors).toEqual([]);
	});
});

const hellos = (h: Harness) =>
	h.posted.filter((m) => m.type === "hello").length;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean) {
	for (let tries = 0; tries < 500 && !condition(); tries++) await sleep(1);
	expect(condition()).toBe(true);
}

const pings = (h: Harness) => h.sent.filter((m) => m.type === "ping").length;

function greet(h: Harness) {
	h.fromHub({
		type: "hello",
		viewer: { userId: "u1", name: "Ada", image: null },
		author: false,
		writable: true,
	});
}

describe("page storage runtime, reconnecting", () => {
	test("a dropped socket asks the host again and storage works on the new one", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket?ticket=1" });
		greet(h);
		await h.storage.ready;

		const before = hellos(h);
		h.closeSocket(1006);
		await until(() => hellos(h) > before);

		h.toFrame({ type: "connect", url: "wss://realtime/socket?ticket=2" });
		expect(h.socketOpened()).toBe("wss://realtime/socket?ticket=2");
		greet(h);

		const pending = h.storage.get("k");
		await flush();
		h.fromHub({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "get", value: "v" },
		});
		expect(await pending).toBe("v");
	});

	test("a socket the hub refused is not dialled again", async () => {
		const h = mount();
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		greet(h);
		await h.storage.ready;

		const before = hellos(h);
		h.closeSocket(4403);
		await sleep(10);
		expect(hellos(h)).toBe(before);
	});

	test("a socket that stops answering pings is replaced", async () => {
		const h = mount({ heartbeatMs: 2 });
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		greet(h);
		await h.storage.ready;

		const before = hellos(h);
		await until(() => hellos(h) > before);
		expect(pings(h)).toBeGreaterThan(0);
	});

	test("a socket that answers pings is kept", async () => {
		const h = mount({ heartbeatMs: 2, answerPings: true });
		h.toFrame({ type: "connect", url: "wss://realtime/socket" });
		greet(h);
		await h.storage.ready;

		const before = hellos(h);
		await until(() => pings(h) >= 4);
		expect(hellos(h)).toBe(before);
	});
});
