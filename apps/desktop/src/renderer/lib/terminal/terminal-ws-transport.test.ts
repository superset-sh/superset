import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import * as relaySocketModule from "@superset/workspace-client/relay-socket";
import type { Terminal as XTerm } from "@xterm/xterm";

// The transport builds on createRelaySocket (partysocket) — reconnection,
// backoff, and the relay preflight live inside the shared socket. We inject a
// fake so tests drive the transport's own behavior (state, diagnosis,
// coalescing, liveness) deterministically, without a real socket or fetch.
type Listener = (event: {
	data?: unknown;
	code?: unknown;
	reason?: unknown;
}) => void;

class FakeRelaySocket {
	static instances: FakeRelaySocket[] = [];

	readyState = 0; // WebSocket.CONNECTING
	binaryType: BinaryType = "blob";
	sent: string[] = [];
	builtUrls: string[] = [];
	dialedUrls: string[] = [];
	openedUrls: string[] = [];
	tokenReadCount = 0;
	cancelledDialCount = 0;
	reconnectCount = 0;
	// partysocket's authoritative per-attempt counter: bumped on each failed
	// dial, reset to 0 by reconnect() and (in reality) after minUptime of a
	// stable connection — simulated here by stabilize().
	retryCount = 0;
	closed = false;
	readonly options: Record<string, unknown>;
	private readonly listeners = new Map<string, Set<Listener>>();

	constructor(options: Record<string, unknown>) {
		this.options = options;
		FakeRelaySocket.instances.push(this);
	}

	addEventListener(type: string, listener: Listener) {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Set();
			this.listeners.set(type, set);
		}
		set.add(listener);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close() {
		this.closed = true;
		this.readyState = 3; // CLOSED
		this.dispatch("close", { code: 1000, reason: "" });
	}

	reconnect() {
		this.reconnectCount += 1;
		this.retryCount = 0;
		this.readyState = 0;
	}

	/**
	 * Exercise the async URL-provider ordering used by createRelaySocket. The
	 * optional gate pauses after buildUrl has captured an endpoint but before
	 * getToken completes, reproducing an endpoint swap during a pending dial.
	 */
	async dial(tokenGate?: Promise<void>) {
		const buildUrl = this.options.buildUrl as
			| (() => string | Promise<string>)
			| undefined;
		const getToken = this.options.getToken as
			| (() => string | null | Promise<string | null>)
			| undefined;
		const isDialCurrent = this.options.isDialCurrent as
			| (() => boolean)
			| undefined;
		if (!buildUrl || !getToken) throw new Error("missing relay URL provider");
		if (isDialCurrent?.() === false) {
			this.cancelledDialCount += 1;
			return null;
		}

		const base = await buildUrl();
		this.builtUrls.push(base);
		await tokenGate;
		if (isDialCurrent?.() === false) {
			this.cancelledDialCount += 1;
			return null;
		}
		this.tokenReadCount += 1;
		const token = await getToken();
		if (isDialCurrent?.() === false) {
			this.cancelledDialCount += 1;
			return null;
		}
		const url = new URL(base);
		if (token) url.searchParams.set("token", token);
		const signedUrl = url.toString();
		this.dialedUrls.push(signedUrl);
		if (this.closed) return signedUrl;

		this.openedUrls.push(signedUrl);
		this.open();
		return signedUrl;
	}

	emitProbe(probe: { status: number; region: string | null } | null) {
		const onProbe = this.options.onProbe as
			| ((value: { status: number; region: string | null } | null) => void)
			| undefined;
		onProbe?.(probe);
	}

	emitAccessDenied() {
		const onAccessDenied = this.options.onAccessDenied as
			| (() => void)
			| undefined;
		onAccessDenied?.();
	}

	// ---- test drivers ----
	open() {
		this.readyState = 1; // OPEN
		this.dispatch("open", {});
	}

	/** Simulate minUptime elapsing on a stable connection (partysocket resets
	 * retryCount only after the connection has been up a while, not on open). */
	stabilize() {
		this.retryCount = 0;
	}

	/** A real server close: the connection opened, then the host dropped it
	 * (numeric code, e.g. relay 1006). */
	drop(code: number | string = 1006, reason = "") {
		this.retryCount += 1;
		this.readyState = 3;
		this.dispatch("close", { code, reason });
	}

	/** A dial failure: the socket never opened (host unreachable, upgrade
	 * rejected). partysocket bumps retryCount and surfaces it as an error plus a
	 * synthetic close whose clone mangles the code to the string "close". */
	dialFail() {
		this.retryCount += 1;
		this.readyState = 3;
		this.dispatch("error", {});
		this.dispatch("close", { code: "close" });
	}

	message(data: unknown) {
		this.dispatch("message", { data });
	}

	private dispatch(type: string, event: Parameters<Listener>[0]) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}

// bun's mock.module is process-global and leaks to every later test file in the
// whole desktop run, so a partial stub breaks unrelated tests that import the
// module's other named exports. Preserve the real exports and override only
// createRelaySocket. (auth-client / posthog are deliberately NOT mocked: with a
// faked socket getToken/ensureFreshJwt never runs, and posthog.capture before
// init is a harmless no-op — the real modules load fine, as the prior test did.)
mock.module("@superset/workspace-client/relay-socket", () => ({
	...relaySocketModule,
	createRelaySocket: (options: Record<string, unknown>) =>
		new FakeRelaySocket(options),
}));

const {
	connect,
	createTransport,
	disconnect,
	findReplayOverlap,
	reconnect,
	sendResize,
	setRenderedBaselineState,
} = await import("./terminal-ws-transport");

function encodeBytes(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

// `window` is aliased to `globalThis` by the xterm-env-polyfill preload, and
// `globalThis.addEventListener` is absent on Linux CI runtimes, so the transport's
// `window.addEventListener` call throws there. Guarantee the methods exist.
const win = globalThis.window as unknown as Record<string, unknown> | undefined;
const originalAddEventListener = win?.addEventListener;
const originalRemoveEventListener = win?.removeEventListener;

function createMockTerminal(
	cols = 101,
	rows = 27,
): XTerm & { emitData(data: string): void } {
	let onDataListener: ((data: string) => void) | null = null;
	return {
		cols,
		rows,
		onData: (listener: (data: string) => void) => {
			onDataListener = listener;
			return { dispose() {} };
		},
		emitData(data: string) {
			onDataListener?.(data);
		},
		write() {},
		writeln() {},
	} as unknown as XTerm & { emitData(data: string): void };
}

function createReplayPersistence(
	initialCheckpoint: Uint8Array = new Uint8Array(),
	flush: () => boolean | Promise<boolean> = () => true,
	updateCheckpoint: (checkpoint: Uint8Array) => void = () => {},
) {
	return { initialCheckpoint, updateCheckpoint, flush };
}

function announceReplay(
	socket: FakeRelaySocket,
	replayKind: "full" | "delta" | "none",
	data: Uint8Array,
	options: {
		replayId?: number;
		prefix?: Uint8Array;
		truncated?: boolean;
	} = {},
): Uint8Array {
	const prefix = options.prefix ?? new Uint8Array();
	socket.message(
		JSON.stringify({
			type: "attached",
			terminalId: "t1",
			replayKind,
			replayId: options.replayId,
			replayPrefixBytes: prefix.byteLength,
			replayDataBytes: data.byteLength,
			replayTruncated: options.truncated || undefined,
		}),
	);
	const frame = new Uint8Array(prefix.byteLength + data.byteLength);
	frame.set(prefix, 0);
	frame.set(data, prefix.byteLength);
	return frame;
}

/** Connect and drive the fake socket to a live, attached session. */
function connectAttached(url = "ws://host/terminal/t1") {
	const transport = createTransport();
	const terminal = createMockTerminal();
	connect(transport, terminal, url);
	const socket = FakeRelaySocket.instances.at(-1);
	if (!socket) throw new Error("expected relay socket instance");
	socket.open();
	socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
	return { transport, terminal, socket };
}

function withFrameStubs(run: () => void) {
	const originalRaf = globalThis.requestAnimationFrame;
	const originalCancelRaf = globalThis.cancelAnimationFrame;
	globalThis.requestAnimationFrame = () => 1;
	globalThis.cancelAnimationFrame = () => {};
	try {
		run();
	} finally {
		globalThis.requestAnimationFrame = originalRaf;
		globalThis.cancelAnimationFrame = originalCancelRaf;
	}
}

beforeEach(() => {
	FakeRelaySocket.instances = [];
	if (win && typeof win.addEventListener !== "function") {
		win.addEventListener = () => {};
	}
	if (win && typeof win.removeEventListener !== "function") {
		win.removeEventListener = () => {};
	}
});

afterEach(() => {
	if (win) {
		win.addEventListener = originalAddEventListener;
		win.removeEventListener = originalRemoveEventListener;
	}
	setSystemTime();
	jest.useRealTimers();
});

describe("PTY output write coalescing", () => {
	let frameCallbacks: Map<number, FrameRequestCallback>;
	let nextFrameId: number;
	const originalRaf = globalThis.requestAnimationFrame;
	const originalCancelRaf = globalThis.cancelAnimationFrame;

	function fireFrame() {
		const callbacks = [...frameCallbacks.values()];
		frameCallbacks.clear();
		for (const callback of callbacks) {
			callback(performance.now());
		}
	}

	beforeEach(() => {
		frameCallbacks = new Map();
		nextFrameId = 1;
		globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
			const id = nextFrameId++;
			frameCallbacks.set(id, callback);
			return id;
		};
		globalThis.cancelAnimationFrame = (id: number) => {
			frameCallbacks.delete(id);
		};
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = originalRaf;
		globalThis.cancelAnimationFrame = originalCancelRaf;
	});

	function connectWithRecordingTerminal() {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		const events: string[] = [];
		(terminal as unknown as { write: (d: Uint8Array) => void }).write = (
			data: Uint8Array,
		) => {
			const text = new TextDecoder().decode(data);
			writes.push(text);
			events.push(`write:${text}`);
		};
		(terminal as unknown as { writeln: (s: string) => void }).writeln = (
			line: string,
		) => {
			events.push(`writeln:${line}`);
		};
		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		return { transport, socket, writes, events };
	}

	function binaryFrame(text: string): ArrayBuffer {
		const bytes = new TextEncoder().encode(text);
		return bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
	}

	test("coalesces binary frames into one terminal.write per frame", () => {
		const { writes, socket } = connectWithRecordingTerminal();

		socket.message(binaryFrame("chunk1"));
		socket.message(binaryFrame("chunk2"));
		socket.message(binaryFrame("chunk3"));
		expect(writes).toEqual([]);

		fireFrame();
		expect(writes).toEqual(["chunk1chunk2chunk3"]);
	});

	test("flushes pending PTY bytes before writing the exit notice", () => {
		const { events, socket } = connectWithRecordingTerminal();

		socket.message(binaryFrame("final output"));
		socket.message(JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }));

		expect(events).toEqual([
			"write:final output",
			"writeln:\r\n[terminal] exited with code 0 (signal 0)",
		]);
	});

	test("does not flush pending PTY bytes for non-writing control messages", () => {
		const { writes, socket } = connectWithRecordingTerminal();

		socket.message(binaryFrame("prompt"));
		socket.message(JSON.stringify({ type: "title", title: "agent" }));
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(writes).toEqual([]);

		fireFrame();
		expect(writes).toEqual(["prompt"]);
	});

	test("flushes pending PTY bytes when the socket closes", () => {
		const { writes, socket } = connectWithRecordingTerminal();

		socket.message(binaryFrame("tail"));
		socket.drop(1006, "host restart");

		expect(writes).toEqual(["tail"]);
	});
});

describe("terminal-ws-transport", () => {
	test("mock preserves the relay-socket module's other exports", async () => {
		// Regression guard: bun's mock.module is process-global, so stubbing only
		// createRelaySocket drops the module's other exports (e.g.
		// setRelaySocketTelemetry, which renderer/lib/posthog imports) and crashes
		// unrelated desktop tests suite-wide with "export not found". The mock must
		// spread the real module — assert that here so a partial stub fails fast.
		const mod = await import("@superset/workspace-client/relay-socket");
		expect(typeof mod.setRelaySocketTelemetry).toBe("function");
	});

	test("replaces the socket when the endpoint changes during a pending dial", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		connect(transport, terminal, "ws://old-host/terminal/t1?token=old-token");
		const oldSocket = FakeRelaySocket.instances[0];
		if (!oldSocket) throw new Error("expected first relay socket instance");

		let releaseOldToken!: () => void;
		const oldTokenGate = new Promise<void>((resolve) => {
			releaseOldToken = resolve;
		});
		const oldDial = oldSocket.dial(oldTokenGate);
		// Let the old provider capture buildUrl before changing the endpoint; it is
		// now suspended at the async token boundary.
		await Promise.resolve();
		expect(oldSocket.builtUrls).toHaveLength(1);
		const capturedOldUrl = new URL(oldSocket.builtUrls[0] ?? "");
		expect(capturedOldUrl.host).toBe("old-host");
		expect(capturedOldUrl.pathname).toBe("/terminal/t1");

		connect(transport, terminal, "ws://new-host/terminal/t2?token=new-token");
		const newSocket = FakeRelaySocket.instances[1];
		if (!newSocket)
			throw new Error("expected replacement relay socket instance");

		expect(oldSocket.closed).toBe(true);
		expect(transport._socket as unknown).toBe(newSocket);
		expect(transport.connectionState).toBe("connecting");

		// Provider callbacks from the superseded generation cannot poison the new
		// endpoint's diagnostics or terminate its connection.
		oldSocket.emitProbe({ status: 503, region: "stale" });
		oldSocket.emitAccessDenied();
		expect(transport._lastProbe).toBeNull();
		expect(transport._terminated).toBe(false);
		expect(transport.connectionState).toBe("connecting");

		await newSocket.dial();
		expect(newSocket.openedUrls).toHaveLength(1);
		const openedNewUrl = new URL(newSocket.openedUrls[0] ?? "");
		expect(openedNewUrl.host).toBe("new-host");
		expect(openedNewUrl.pathname).toBe("/terminal/t2");
		expect(openedNewUrl.searchParams.get("token")).toBe("new-token");
		newSocket.emitProbe({ status: 200, region: "current" });
		expect(transport._lastProbe).toEqual({
			status: 200,
			region: "current",
		});

		// The delayed old provider may finish, but its closed wrapper cannot open
		// or become the transport's only dial.
		releaseOldToken();
		await oldDial;
		expect(oldSocket.cancelledDialCount).toBe(1);
		expect(oldSocket.tokenReadCount).toBe(0);
		expect(oldSocket.dialedUrls).toEqual([]);
		expect(oldSocket.openedUrls).toEqual([]);
		expect(transport._socket as unknown).toBe(newSocket);
	});

	test("keeps one socket and refreshes the token for the same endpoint", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		connect(transport, terminal, "ws://host/terminal/t1?token=token-1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");

		await socket.dial();
		connect(transport, terminal, "ws://host/terminal/t1?token=token-2");
		await socket.dial();

		expect(FakeRelaySocket.instances).toHaveLength(1);
		expect(socket.closed).toBe(false);
		expect(
			socket.openedUrls.map((url) => new URL(url).searchParams.get("token")),
		).toEqual(["token-1", "token-2"]);
	});

	test("advertises replay protocol v1 and keeps replay=0 for old hosts on reconnect", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		setRenderedBaselineState(transport, true);
		connect(
			transport,
			terminal,
			"ws://host/terminal/t1?workspaceId=w1&token=secret",
		);
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		const buildUrl = socket.options.buildUrl as () => string;
		const built = new URL(buildUrl());

		expect(built.searchParams.get("workspaceId")).toBe("w1");
		expect(built.searchParams.get("replayProtocol")).toBe("1");
		expect(built.searchParams.get("replay")).toBe("0");
		expect(built.searchParams.has("token")).toBe(false);
	});

	test("preserves an unknown restored baseline and appends the bounded tail", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			writes.push(new TextDecoder().decode(data));
			callback?.();
		};
		setRenderedBaselineState(transport, true);
		let socket!: FakeRelaySocket;

		withFrameStubs(() => {
			connect(
				transport,
				terminal,
				"ws://host/terminal/t1",
				createReplayPersistence(),
			);
			socket = FakeRelaySocket.instances[0] as FakeRelaySocket;
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "full",
					replayId: 101,
				}),
			);
			socket.message(new TextEncoder().encode("prompt").buffer);
			transport._writeCoalescer?.flushSync();
		});
		await Promise.resolve();

		expect(writes).toEqual(["prompt"]);
		expect(
			socket.sent.map((payload) => JSON.parse(payload) as unknown),
		).toContainEqual({ type: "replay-ack", replayId: 101 });
		expect(writes.join("")).not.toContain("\u001bc");
	});

	test("appends delta replay to a restored buffer without resetting it", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(terminal as unknown as { write: (data: Uint8Array) => void }).write = (
			data,
		) => writes.push(new TextDecoder().decode(data));
		setRenderedBaselineState(transport, true);

		withFrameStubs(() => {
			connect(transport, terminal, "ws://host/terminal/t1");
			const socket = FakeRelaySocket.instances[0];
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "delta",
				}),
			);
			socket.message(new TextEncoder().encode("tail").buffer);
			transport._writeCoalescer?.flushSync();
		});

		expect(writes).toEqual(["tail"]);
	});

	test("keeps a restored buffer when the host has no replay", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		setRenderedBaselineState(transport, true);

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(
			JSON.stringify({
				type: "attached",
				terminalId: "t1",
				replayKind: "none",
			}),
		);

		expect(transport._hasRenderedBaseline).toBe(true);
	});

	test("treats a pre-v1 attached message without replayKind as legacy", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(terminal as unknown as { write: (data: Uint8Array) => void }).write = (
			data,
		) => writes.push(new TextDecoder().decode(data));
		setRenderedBaselineState(transport, true);

		withFrameStubs(() => {
			connect(transport, terminal, "ws://host/terminal/t1");
			const socket = FakeRelaySocket.instances[0];
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
			socket.message(new TextEncoder().encode("legacy-live-tail").buffer);
			transport._writeCoalescer?.flushSync();
		});

		expect(writes).toEqual(["legacy-live-tail"]);
	});

	test("does not reset a fresh terminal for a full replay", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			writes.push(new TextDecoder().decode(data));
			callback?.();
		};
		let socket!: FakeRelaySocket;

		withFrameStubs(() => {
			connect(
				transport,
				terminal,
				"ws://host/terminal/t1",
				createReplayPersistence(),
			);
			socket = FakeRelaySocket.instances[0] as FakeRelaySocket;
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "full",
					replayId: 102,
				}),
			);
			socket.message(new TextEncoder().encode("prompt").buffer);
			transport._writeCoalescer?.flushSync();
		});
		await Promise.resolve();

		expect(writes).toEqual(["prompt"]);
		expect(
			socket.sent.map((payload) => JSON.parse(payload) as unknown),
		).toContainEqual({ type: "replay-ack", replayId: 102 });
	});

	test("does not acknowledge a full replay when durable persistence fails", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		let writeCallback: (() => void) | undefined;
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (_data, callback) => {
			writeCallback = callback;
		};

		connect(
			transport,
			terminal,
			"ws://host/terminal/t1",
			createReplayPersistence(new Uint8Array(), () => false),
		);
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(
			JSON.stringify({
				type: "attached",
				terminalId: "t1",
				replayKind: "full",
				replayId: 107,
			}),
		);
		socket.message(new TextEncoder().encode("full replay").buffer);
		writeCallback?.();
		await Promise.resolve();

		expect(socket.sent.some((payload) => payload.includes("replay-ack"))).toBe(
			false,
		);
	});

	test("acknowledges only after xterm parsing and durable persistence finish", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const events: string[] = [];
		let writeCallback: (() => void) | undefined;
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (_data, callback) => {
			events.push("xterm-write");
			writeCallback = callback;
		};

		connect(
			transport,
			terminal,
			"ws://host/terminal/t1",
			createReplayPersistence(new Uint8Array(), () => {
				events.push("persist");
				return true;
			}),
		);
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(
			JSON.stringify({
				type: "attached",
				terminalId: "t1",
				replayKind: "full",
				replayId: 108,
			}),
		);
		socket.message(new TextEncoder().encode("full replay").buffer);

		expect(events).toEqual(["xterm-write"]);
		expect(socket.sent.some((payload) => payload.includes("replay-ack"))).toBe(
			false,
		);

		writeCallback?.();
		await Promise.resolve();

		expect(events).toEqual(["xterm-write", "persist"]);
		expect(
			socket.sent.map((payload) => JSON.parse(payload) as unknown),
		).toContainEqual({ type: "replay-ack", replayId: 108 });
	});

	test("does not let a stale parser callback ACK a reused replay ID after reconnect", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writeCallbacks: (() => void)[] = [];
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (_data, callback) => {
			if (callback) writeCallbacks.push(callback);
		};

		connect(
			transport,
			terminal,
			"ws://host/terminal/t1",
			createReplayPersistence(),
		);
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		let frame = announceReplay(socket, "full", encodeBytes("old replay"), {
			replayId: 1,
		});
		socket.message(frame.buffer);

		// A restarted host may restart its replay-ID sequence. RelaySocket keeps
		// the same JS wrapper, so the underlying connection generation must guard
		// the old xterm parser callback even when the ID is reused.
		socket.drop(1006, "host restart");
		socket.open();
		frame = announceReplay(socket, "full", encodeBytes("new replay"), {
			replayId: 1,
		});

		writeCallbacks[0]?.();
		await Promise.resolve();
		expect(socket.sent.some((payload) => payload.includes("replay-ack"))).toBe(
			false,
		);

		socket.message(frame.buffer);
		writeCallbacks[1]?.();
		await Promise.resolve();
		expect(
			socket.sent.filter((payload) => payload.includes("replay-ack")),
		).toEqual([JSON.stringify({ type: "replay-ack", replayId: 1 })]);
	});

	test("reconciles zero, partial, and full raw replay overlap without erasing history", () => {
		const anchor = "x".repeat(300);
		const cases = [
			{
				name: "zero",
				checkpoint: "older:",
				replay: "new",
				written: "new",
				checkpointAfter: "older:new",
			},
			{
				name: "partial",
				checkpoint: `older:${anchor}`,
				replay: `${anchor}def`,
				written: "def",
				checkpointAfter: `older:${anchor}def`,
			},
			{
				name: "full",
				checkpoint: `older:${anchor}`,
				replay: anchor,
				written: "",
				checkpointAfter: `older:${anchor}`,
			},
		];

		for (const testCase of cases) {
			const transport = createTransport();
			const terminal = createMockTerminal();
			const writes: Uint8Array[] = [];
			let checkpoint = encodeBytes(testCase.checkpoint);
			(
				terminal as unknown as {
					write: (data: Uint8Array, callback?: () => void) => void;
				}
			).write = (data, callback) => {
				writes.push(data);
				callback?.();
			};
			setRenderedBaselineState(transport, true);
			connect(
				transport,
				terminal,
				`ws://host/terminal/${testCase.name}`,
				createReplayPersistence(
					checkpoint,
					() => true,
					(next) => {
						checkpoint = next;
					},
				),
			);
			const socket = FakeRelaySocket.instances.at(-1);
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			const frame = announceReplay(
				socket,
				"delta",
				encodeBytes(testCase.replay),
			);
			socket.message(frame.buffer);

			expect(new TextDecoder().decode(writes[0]), testCase.name).toBe(
				testCase.written,
			);
			expect(new TextDecoder().decode(checkpoint), testCase.name).toBe(
				testCase.checkpointAfter,
			);
		}
	});

	test("keeps mode preamble and restored notice bytes out of the raw checkpoint", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const prefix = encodeBytes("\u001b[?2004hRESTORED\r\n");
		let checkpoint = encodeBytes("abc");
		let written: Uint8Array<ArrayBufferLike> = new Uint8Array();
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			written = data;
			callback?.();
		};
		setRenderedBaselineState(transport, true);
		connect(
			transport,
			terminal,
			"ws://host/terminal/prefix",
			createReplayPersistence(
				checkpoint,
				() => true,
				(next) => {
					checkpoint = next;
				},
			),
		);
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		const frame = announceReplay(socket, "delta", encodeBytes("abcdef"), {
			prefix,
		});
		socket.message(frame.buffer);

		expect(new TextDecoder().decode(written)).toBe(
			"\u001b[?2004hRESTORED\r\ndef",
		);
		expect(new TextDecoder().decode(checkpoint)).toBe("abcdef");
	});

	test("re-feeds a multibyte UTF-8 lead byte when overlap ends mid-codepoint", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const common = "x".repeat(300);
		const replay = encodeBytes(`${common}€Z`);
		const checkpointPrefix = encodeBytes("history:");
		const replayPrefixBytes = encodeBytes(common).byteLength + 1;
		let checkpoint: Uint8Array<ArrayBufferLike> = new Uint8Array(
			checkpointPrefix.byteLength + replayPrefixBytes,
		);
		checkpoint.set(checkpointPrefix, 0);
		checkpoint.set(
			replay.subarray(0, replayPrefixBytes),
			checkpointPrefix.byteLength,
		);
		let written: Uint8Array<ArrayBufferLike> = new Uint8Array();
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			written = data;
			callback?.();
		};
		setRenderedBaselineState(transport, true);
		connect(
			transport,
			terminal,
			"ws://host/terminal/utf8",
			createReplayPersistence(
				checkpoint,
				() => true,
				(next) => {
					checkpoint = next;
				},
			),
		);
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		const frame = announceReplay(socket, "delta", replay);
		socket.message(frame.buffer);

		expect(new TextDecoder().decode(written)).toBe("€Z");
		expect(new TextDecoder().decode(checkpoint)).toBe(`history:${common}€Z`);
	});

	test("does not ACK when the socket closes or its generation changes during durable flush", async () => {
		for (const reopen of [false, true]) {
			let resolveFlush: (value: boolean) => void = () => {};
			const flush = new Promise<boolean>((resolve) => {
				resolveFlush = resolve;
			});
			const transport = createTransport();
			const terminal = createMockTerminal();
			let callback: (() => void) | undefined;
			(
				terminal as unknown as {
					write: (data: Uint8Array, done?: () => void) => void;
				}
			).write = (_data, done) => {
				callback = done;
			};
			connect(
				transport,
				terminal,
				`ws://host/terminal/flush-race-${reopen}`,
				createReplayPersistence(new Uint8Array(), () => flush),
			);
			const socket = FakeRelaySocket.instances.at(-1);
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			const frame = announceReplay(socket, "full", encodeBytes("tail"), {
				replayId: 100,
			});
			socket.message(frame.buffer);
			callback?.();
			await Promise.resolve();
			socket.drop(1006, "closed during flush");
			if (reopen) socket.open();
			resolveFlush(true);
			await Promise.resolve();
			await Promise.resolve();
			expect(socket.sent.some((item) => item.includes("replay-ack"))).toBe(
				false,
			);
		}
	});

	test("findReplayOverlap handles repeated-prefix full matches", () => {
		expect(findReplayOverlap(encodeBytes("xxabab"), encodeBytes("abab"))).toBe(
			4,
		);
		expect(findReplayOverlap(encodeBytes("xxababa"), encodeBytes("abab"))).toBe(
			3,
		);
	});

	test("requests full replay again when a full attach closes before bytes", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			writes.push(new TextDecoder().decode(data));
			callback?.();
		};
		setRenderedBaselineState(transport, true);
		let socket!: FakeRelaySocket;

		withFrameStubs(() => {
			connect(
				transport,
				terminal,
				"ws://host/terminal/t1",
				createReplayPersistence(),
			);
			socket = FakeRelaySocket.instances[0] as FakeRelaySocket;
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "full",
					replayId: 103,
				}),
			);
			socket.drop(1006, "host restart");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "full",
					replayId: 104,
				}),
			);
			socket.message(new TextEncoder().encode("prompt").buffer);
			transport._writeCoalescer?.flushSync();
		});
		await Promise.resolve();

		expect(writes).toEqual(["prompt"]);
		expect(
			socket.sent
				.map(
					(payload) =>
						JSON.parse(payload) as { type?: string; replayId?: number },
				)
				.filter(({ type }) => type === "replay-ack"),
		).toEqual([{ type: "replay-ack", replayId: 104 }]);
	});

	test("reconciles a live renderer baseline after host restart adopts a full replay", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const writes: string[] = [];
		(
			terminal as unknown as {
				write: (data: Uint8Array, callback?: () => void) => void;
			}
		).write = (data, callback) => {
			writes.push(new TextDecoder().decode(data));
			callback?.();
		};

		withFrameStubs(() => {
			connect(
				transport,
				terminal,
				"ws://host/terminal/t1",
				createReplayPersistence(),
			);
			const socket = FakeRelaySocket.instances[0];
			if (!socket) throw new Error("expected relay socket instance");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "delta",
				}),
			);
			socket.message(new TextEncoder().encode("old prompt").buffer);
			transport._writeCoalescer?.flushSync();

			socket.drop(1006, "host restart");
			socket.open();
			socket.message(
				JSON.stringify({
					type: "attached",
					terminalId: "t1",
					replayKind: "full",
					replayId: 105,
				}),
			);
			socket.message(
				new TextEncoder().encode("old promptadopted replay").buffer,
			);
			transport._writeCoalescer?.flushSync();
		});

		expect(writes).toEqual(["old prompt", "adopted replay"]);
		expect(writes.join("")).not.toContain("\u001bc");
	});

	test("keeps scrollback older than the daemon ring when applying a full replay", async () => {
		const [{ Terminal: HeadlessTerminal }, { SerializeAddon }] =
			await Promise.all([
				import("@xterm/headless"),
				import("@xterm/addon-serialize"),
			]);
		const terminal = new HeadlessTerminal({
			cols: 100,
			rows: 24,
			scrollback: 2500,
			allowProposedApi: true,
		});
		const serializer = new SerializeAddon();
		terminal.loadAddon(
			serializer as unknown as Parameters<typeof terminal.loadAddon>[0],
		);
		const oldMarker = "history-before-64k-daemon-ring";
		const historical = `${oldMarker}\r\n${Array.from(
			{ length: 1600 },
			(_, index) =>
				`old-line-${index.toString().padStart(4, "0")}-${"x".repeat(40)}\r\n`,
		).join("")}`;
		await new Promise<void>((resolve) => terminal.write(historical, resolve));

		const transport = createTransport();
		setRenderedBaselineState(transport, true);
		connect(
			transport,
			terminal as unknown as XTerm,
			"ws://host/terminal/t1",
			createReplayPersistence(),
		);
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(
			JSON.stringify({
				type: "attached",
				terminalId: "t1",
				replayKind: "full",
				replayId: 106,
			}),
		);
		// This is the daemon's complete bounded ring and intentionally has no raw
		// anchor in the restored snapshot. The old RIS path erased oldMarker.
		socket.message(new Uint8Array(64 * 1024).fill(0x79).buffer);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(serializer.serialize({ scrollback: 2500 })).toContain(oldMarker);
		expect(
			socket.sent.map((payload) => JSON.parse(payload) as unknown),
		).toContainEqual({ type: "replay-ack", replayId: 106 });

		disconnect(transport);
		terminal.dispose();
	});

	test("server-sent error routes to logs, not xterm, and terminates", () => {
		const transport = createTransport();
		const writelnCalls: string[] = [];
		const terminal = createMockTerminal();
		(terminal as unknown as { writeln: (s: string) => void }).writeln = (
			s: string,
		) => {
			writelnCalls.push(s);
		};

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();

		socket.message(
			JSON.stringify({
				type: "error",
				message:
					'Terminal session "t1" is not active; create it before connecting.',
			}),
		);

		expect(writelnCalls).toEqual([]);
		expect(transport.logs).toHaveLength(1);
		expect(transport.logs[0]?.level).toBe("error");
		expect(transport.logs[0]?.message).toContain("is not active");
		// Fatal error terminates: the socket is closed so it won't re-dial.
		expect(socket.closed).toBe(true);
	});

	test("waits for server attach before sending resize or input", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		const sentMessages = () =>
			socket.sent.map((payload) => JSON.parse(payload) as unknown);

		socket.open();
		expect(transport.connectionState).toBe("connecting");
		expect(sentMessages()).toEqual([]);

		terminal.emitData("a");
		expect(sentMessages()).toEqual([]);

		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
		expect(sentMessages()).toEqual([{ type: "resize", cols: 101, rows: 27 }]);

		terminal.emitData("b");
		expect(sentMessages()).toEqual([
			{ type: "resize", cols: 101, rows: 27 },
			{ type: "input", data: "b" },
		]);
	});

	test("sends exact geometry once per connection and deduplicates later resizes", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances[0];
		if (!socket) throw new Error("expected relay socket instance");
		const sentMessages = () =>
			socket.sent.map((payload) => JSON.parse(payload) as unknown);

		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		sendResize(transport, 101, 27);
		sendResize(transport, 102, 27);
		expect(sentMessages()).toEqual([
			{ type: "resize", cols: 101, rows: 27 },
			{ type: "resize", cols: 102, rows: 27 },
		]);

		// createRelaySocket keeps one wrapper but opens a fresh underlying socket
		// after a reconnect. The new connection must receive geometry again.
		socket.drop(1006, "offline");
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(sentMessages()).toEqual([
			{ type: "resize", cols: 101, rows: 27 },
			{ type: "resize", cols: 102, rows: 27 },
			{ type: "resize", cols: 101, rows: 27 },
		]);
	});

	test("never gives up: keeps one socket and never self-closes on repeated failures", () => {
		const { socket } = connectAttached();

		// A host that stays offline drops us over and over. The transport must
		// keep delegating retries to the shared socket — never close it (which
		// would stop partysocket) and never re-create it.
		for (let i = 0; i < 25; i++) socket.drop(1006, "offline");

		expect(FakeRelaySocket.instances.length).toBe(1);
		expect(socket.closed).toBe(false);
		expect(socket.reconnectCount).toBe(0);
	});

	test("surfaces the diagnosis only after the threshold, and logs it once", () => {
		const { transport, socket } = connectAttached();

		for (let i = 0; i < 9; i++) socket.drop(1006, "offline");
		expect(transport.lastDiagnosis).toBeNull();
		expect(
			transport.logs.filter((l) => l.message.includes("Still retrying")),
		).toHaveLength(0);

		// The 10th consecutive failure crosses the threshold.
		socket.drop(1006, "offline");
		expect(transport.lastDiagnosis).not.toBeNull();

		// Further failures keep the diagnosis fresh but don't re-log or re-spam.
		for (let i = 0; i < 10; i++) socket.drop(1006, "offline");
		expect(transport.lastDiagnosis).not.toBeNull();
		expect(
			transport.logs.filter((l) => l.message.includes("Still retrying")),
		).toHaveLength(1);
	});

	test("does not accrue an offline diagnosis while the window is hidden", () => {
		const { transport, socket } = connectAttached();

		const originalDocument = (globalThis as { document?: unknown }).document;
		(globalThis as { document?: unknown }).document = { hidden: true };
		try {
			// Well past the threshold, but hidden — the header must stay clean.
			for (let i = 0; i < 20; i++) socket.drop(1006, "offline");
			expect(transport.lastDiagnosis).toBeNull();
			expect(
				transport.logs.filter((l) => l.message.includes("Still retrying")),
			).toHaveLength(0);
		} finally {
			if (originalDocument === undefined) {
				(globalThis as { document?: unknown }).document = undefined;
			} else {
				(globalThis as { document?: unknown }).document = originalDocument;
			}
		}
	});

	test("attach clears the diagnosis; budget resets after a stable connection", () => {
		const { transport, socket } = connectAttached();

		for (let i = 0; i < 12; i++) socket.drop(1006, "offline");
		expect(transport.lastDiagnosis).not.toBeNull();

		// Reconnect + attach clears the current offline state.
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
		expect(transport.lastDiagnosis).toBeNull();

		// Once the connection has been stable a while (retryCount reset), a fresh
		// failure starts the threshold count from scratch — no instant re-flag.
		socket.stabilize();
		socket.drop(1006, "offline");
		expect(transport.lastDiagnosis).toBeNull();
	});

	test("surfaces the diagnosis for dial failures that never open", () => {
		// Never opened: connect but don't open/attach — the host is unreachable.
		const transport = createTransport();
		connect(transport, createMockTerminal(), "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");

		// Every attempt fails BEFORE the socket opens, arriving as an error + a
		// string-code synthetic close (no numeric server close). retryCount still
		// climbs, so the header must eventually explain the outage. The
		// regression: a close-counting gate stays silent forever here, leaving a
		// genuinely-offline terminal retrying with no indication.
		for (let i = 0; i < 9; i++) socket.dialFail();
		expect(transport.lastDiagnosis).toBeNull();

		socket.dialFail(); // 10th consecutive failure crosses the threshold
		expect(transport.lastDiagnosis).not.toBeNull();
	});

	test("manual reconnect() clears termination and re-dials", () => {
		const { transport, socket } = connectAttached();

		socket.message(JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }));
		expect(socket.closed).toBe(true);
		const before = socket.reconnectCount;

		reconnect(transport);
		expect(transport.connectionState).toBe("connecting");
		expect(socket.reconnectCount).toBe(before + 1);
	});

	test("forces a reconnect on the wall-clock gap after sleep/wake", () => {
		jest.useFakeTimers();
		setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const { socket } = connectAttached();
		expect(socket.reconnectCount).toBe(0);

		// Laptop sleeps: the socket dies but never observes it (readyState stays
		// OPEN, no close). Two minutes pass, then the watchdog tick runs on wake.
		setSystemTime(new Date("2026-01-01T00:02:00Z"));
		jest.advanceTimersByTime(120_000);

		// The wall-clock-gap watchdog force-reconnects the wedged socket.
		expect(socket.reconnectCount).toBe(1);
	});

	test("disconnect closes the socket and goes disconnected", () => {
		const { transport, socket } = connectAttached();

		disconnect(transport);
		expect(socket.closed).toBe(true);
		expect(transport.connectionState).toBe("disconnected");
	});

	test("ignores late events from a socket detached during teardown", () => {
		const { transport, socket } = connectAttached();

		disconnect(transport);
		expect(transport.connectionState).toBe("disconnected");

		// A real WS can deliver a trailing close/message after teardown nulls the
		// socket; it must not resurrect "closed" state or push logs.
		socket.drop(1006, "late");
		socket.message(JSON.stringify({ type: "title", title: "late" }));

		expect(transport.connectionState).toBe("disconnected");
		expect(transport.logs).toHaveLength(0);
		expect(transport.title).toBeUndefined();
	});
});
