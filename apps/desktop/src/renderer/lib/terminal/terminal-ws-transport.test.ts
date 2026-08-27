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

const { connect, createTransport, disconnect, park, reconnect } = await import(
	"./terminal-ws-transport"
);

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
		// xterm invokes the completion callback once the batch has parsed; the
		// coalescer holds the next batch until it does, so a double that never
		// calls back would model a permanently stalled parser.
		write(_data: string | Uint8Array, callback?: () => void) {
			callback?.();
		},
		writeln() {},
	} as unknown as XTerm & { emitData(data: string): void };
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

// The park tests feed binary frames into the write coalescer outside the
// coalescing describe's rAF harness; bun's test runtime has no
// requestAnimationFrame, so give it an inert one (those tests never fire a
// frame — pending bytes are flushed by park's coalescer dispose).
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;

beforeEach(() => {
	FakeRelaySocket.instances = [];
	if (win && typeof win.addEventListener !== "function") {
		win.addEventListener = () => {};
	}
	if (win && typeof win.removeEventListener !== "function") {
		win.removeEventListener = () => {};
	}
	if (typeof globalThis.requestAnimationFrame !== "function") {
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => {};
	}
});

afterEach(() => {
	if (win) {
		win.addEventListener = originalAddEventListener;
		win.removeEventListener = originalRemoveEventListener;
	}
	globalThis.requestAnimationFrame = originalRaf;
	globalThis.cancelAnimationFrame = originalCancelRaf;
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
		(
			terminal as unknown as {
				write: (d: Uint8Array, cb?: () => void) => void;
			}
		).write = (data: Uint8Array, callback?: () => void) => {
			const text = new TextDecoder().decode(data);
			writes.push(text);
			events.push(`write:${text}`);
			callback?.();
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
	test("server-sent error routes to logs, not xterm, and keeps the socket retrying", () => {
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
				message: "daemon open t1: timed out after 15000ms",
			}),
		);

		expect(writelnCalls).toEqual([]);
		expect(transport.logs).toHaveLength(1);
		expect(transport.logs[0]?.level).toBe("error");
		expect(transport.logs[0]?.message).toContain("timed out");
		// Transient error must NOT self-close the socket — partysocket never
		// re-dials after close(), which is what used to strand the tab dead.
		expect(socket.closed).toBe(false);
	});

	test("a transient server error falls into the retryable close path", () => {
		const { transport, socket } = connectAttached();

		// Host reports a transient attach failure (pty-daemon stalled), then
		// closes with 1011 — exactly what host-service does after an error frame.
		socket.message(
			JSON.stringify({
				type: "error",
				message: "daemon open t1: timed out after 15000ms",
			}),
		);
		expect(socket.closed).toBe(false);
		expect(transport.sessionEnded).toBe(false);

		socket.drop(1011, "daemon open t1: timed out after 15000ms");
		expect(transport.connectionState).toBe("closed");
		// The close was counted as retryable (logged with an attempt counter),
		// not swallowed by the terminated/1000 early return.
		expect(
			transport.logs.filter((l) => l.message.includes("Reconnecting (attempt")),
		).toHaveLength(1);
	});

	test("repeated transient errors surface the give-up diagnosis only after the attempt budget", () => {
		const { transport, socket } = connectAttached();

		const failOnce = () => {
			socket.message(
				JSON.stringify({
					type: "error",
					message: "daemon open t1: timed out after 15000ms",
				}),
			);
			socket.drop(1011, "daemon open t1: timed out after 15000ms");
		};

		for (let i = 0; i < 9; i++) failOnce();
		expect(
			transport.logs.filter((l) => l.message.includes("Still retrying")),
		).toHaveLength(0);

		// The 10th consecutive failure exhausts the budget: same closed +
		// diagnosis state as any other outage, socket still owned by partysocket.
		failOnce();
		expect(transport.connectionState).toBe("closed");
		expect(transport.lastDiagnosis).not.toBeNull();
		expect(
			transport.logs.filter((l) => l.message.includes("Still retrying")),
		).toHaveLength(1);
		expect(socket.closed).toBe(false);
		expect(transport.sessionEnded).toBe(false);
	});

	test("a terminal recovers from a transient error once the host attaches", () => {
		const { transport, socket } = connectAttached();

		socket.message(
			JSON.stringify({
				type: "error",
				message: "daemon open t1: timed out after 15000ms",
			}),
		);
		socket.drop(1011, "daemon open t1: timed out after 15000ms");
		expect(transport.connectionState).toBe("closed");
		expect(transport.lastDiagnosis).not.toBeNull();

		// The daemon recovered; partysocket's next dial attaches normally.
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
		expect(transport.lastDiagnosis).toBeNull();
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
		// Visibility leads the dims: the host sizes the PTY to the smallest
		// visible client, so it must know whether this pane counts before the
		// dims it would count with.
		expect(sentMessages()).toEqual([
			{ type: "visible", visible: true },
			{ type: "resize", cols: 101, rows: 27 },
		]);

		terminal.emitData("b");
		expect(sentMessages()).toEqual([
			{ type: "visible", visible: true },
			{ type: "resize", cols: 101, rows: 27 },
			{ type: "input", data: "b" },
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

	test("PTY exit marks the session ended and fires the callback once", () => {
		const onSessionEnded = mock(() => {});
		const transport = createTransport({ onSessionEnded });
		const terminal = createMockTerminal();
		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.sessionEnded).toBe(false);

		socket.message(JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }));
		expect(transport.sessionEnded).toBe(true);
		expect(onSessionEnded).toHaveBeenCalledTimes(1);
		// Permanent: no auto-retry after a PTY exit.
		expect(socket.closed).toBe(true);
		expect(
			transport.logs.filter((l) => l.message.includes("Reconnecting (attempt")),
		).toHaveLength(0);
	});

	test("a session-gone attach error marks the session ended", () => {
		const onSessionEnded = mock(() => {});
		const transport = createTransport({ onSessionEnded });
		connect(transport, createMockTerminal(), "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();

		socket.message(
			JSON.stringify({
				type: "error",
				message: 'Terminal session "t1" has exited.',
				code: "session-gone",
			}),
		);

		expect(transport.sessionEnded).toBe(true);
		expect(onSessionEnded).toHaveBeenCalledTimes(1);
		// Permanent: the transport closes the socket so partysocket never
		// re-dials, and the terminated close is not logged as retryable.
		expect(socket.closed).toBe(true);
		expect(transport.connectionState).toBe("closed");
		expect(
			transport.logs.filter((l) => l.message.includes("Reconnecting (attempt")),
		).toHaveLength(0);
	});

	test("a plain server error does not mark the session ended", () => {
		const onSessionEnded = mock(() => {});
		const transport = createTransport({ onSessionEnded });
		connect(transport, createMockTerminal(), "ws://host/terminal/t1");
		const socket = FakeRelaySocket.instances.at(-1);
		if (!socket) throw new Error("expected relay socket instance");
		socket.open();

		socket.message(
			JSON.stringify({
				type: "error",
				message: "Internal terminal attach error",
			}),
		);

		expect(transport.sessionEnded).toBe(false);
		expect(onSessionEnded).not.toHaveBeenCalled();
	});

	test("a successful re-attach resets the session-ended flag", () => {
		const { transport, socket } = connectAttached();

		socket.message(JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }));
		expect(transport.sessionEnded).toBe(true);

		// The session was re-created under the same id and the retry attached.
		reconnect(transport);
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.sessionEnded).toBe(false);
	});

	test("park closes the socket silently, keeping title and stream position", () => {
		const { transport, socket } = connectAttached();
		socket.message(JSON.stringify({ type: "title", title: "agent" }));
		socket.message(
			JSON.stringify({ type: "synced", epoch: "e1", seq: 40, mode: "exact" }),
		);
		const bytes = new TextEncoder().encode("hello");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);

		park(transport);

		expect(socket.closed).toBe(true);
		expect(transport.connectionState).toBe("disconnected");
		// A park is not a failure: no reconnect logs, no diagnosis, no counted
		// attempt — and the resume state survives for the next connect().
		expect(transport.logs).toHaveLength(0);
		expect(transport.lastDiagnosis).toBeNull();
		expect(transport.title).toBe("agent");
		expect(transport.seqAnchor).toEqual({ epoch: "e1", seq: 45 });
	});

	test("park stops the liveness watchdog and ignores late socket events", () => {
		jest.useFakeTimers();
		setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const { transport, socket } = connectAttached();

		park(transport);

		// Sleep/wake after a park must not resurrect the closed socket.
		setSystemTime(new Date("2026-01-01T00:02:00Z"));
		jest.advanceTimersByTime(120_000);
		expect(socket.reconnectCount).toBe(0);

		// A trailing close/message from the closed socket is dropped.
		socket.drop(1006, "late");
		socket.message(JSON.stringify({ type: "title", title: "late" }));
		expect(transport.connectionState).toBe("disconnected");
		expect(transport.logs).toHaveLength(0);
	});

	test("connect() after park dials a fresh socket anchored at the parked position", () => {
		const { transport, terminal, socket } = connectAttached();
		socket.message(
			JSON.stringify({ type: "synced", epoch: "e1", seq: 10, mode: "exact" }),
		);
		const bytes = new TextEncoder().encode("abc");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);
		park(transport);
		expect(FakeRelaySocket.instances).toHaveLength(1);

		connect(transport, terminal, "ws://host/terminal/t1");

		// The parked socket is gone for good; the remount dials a new one whose
		// URL asks the host for exactly the bytes missed while parked.
		expect(FakeRelaySocket.instances).toHaveLength(2);
		const redial = FakeRelaySocket.instances.at(-1);
		if (!redial) throw new Error("expected relay socket instance");
		const buildUrl = redial.options.buildUrl as () => string;
		expect(buildUrl()).toContain("seq=e1%3A13");
		redial.open();
		redial.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
	});

	test("park refuses to disconnect a pre-seq host", () => {
		// A pre-seq host ignores `?seq=` and `replay=0` suppresses its legacy
		// FIFO replay, so a closed socket means the parked gap is silently
		// lost. Such transports keep the legacy always-connected behavior.
		const { transport, socket } = connectAttached();
		const bytes = new TextEncoder().encode("pre-seq output");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);

		park(transport);

		expect(socket.closed).toBe(false);
		expect(transport.connectionState).toBe("open");
	});

	test("park drops an anchor poisoned by uncounted bytes on a seq-aware host", () => {
		// A seq-aware transport (synced seen on an earlier connection) parked
		// between a reattach and its `synced`: the current connection's bytes
		// advanced the xterm without advancing the anchor. Parking must apply
		// the same anchor hygiene the bypassed close handler would have —
		// otherwise the next dial's exact catch-up re-delivers painted bytes.
		const { transport, socket } = connectAttached();
		socket.message(
			JSON.stringify({ type: "synced", epoch: "e1", seq: 10, mode: "exact" }),
		);
		socket.drop(1006, "host restart");
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		const bytes = new TextEncoder().encode("uncounted");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);

		park(transport);

		expect(socket.closed).toBe(true);
		expect(transport.seqAnchor).toBeNull();
	});

	test("park keeps a counted anchor when the connection closed before the park", () => {
		// Counted connection ends (close consumed its per-connection flags),
		// THEN the pane parks while the socket is between dials. The anchor is
		// valid — dropping it would downgrade the next attach to seq=none and
		// lose the replay of everything produced while parked.
		const { transport, socket } = connectAttached();
		socket.message(
			JSON.stringify({ type: "synced", epoch: "e1", seq: 10, mode: "exact" }),
		);
		const bytes = new TextEncoder().encode("counted");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);
		socket.drop(1006, "host restart");
		expect(transport.seqAnchor).toEqual({ epoch: "e1", seq: 17 });

		park(transport);

		expect(transport.seqAnchor).toEqual({ epoch: "e1", seq: 17 });
	});

	test("an endpoint re-point resets seq capability so a legacy host is not parked", () => {
		// Seq capability belongs to the endpoint. After re-pointing (e.g. the
		// local host-service restarted on a new port running an older build),
		// a latched _seqEverSynced from the old endpoint would let park()
		// close a socket the legacy host cannot replay a gap for.
		const { transport, terminal, socket } = connectAttached();
		socket.message(
			JSON.stringify({ type: "synced", epoch: "e1", seq: 10, mode: "exact" }),
		);

		connect(transport, terminal, "ws://host2/terminal/t1");
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		const bytes = new TextEncoder().encode("legacy output, no synced");
		socket.message(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);

		park(transport);

		expect(socket.closed).toBe(false);
		expect(transport.connectionState).toBe("open");
	});

	test("a failed connection after park is counted toward the diagnosis", () => {
		const { transport, terminal } = connectAttached();
		park(transport);

		// Remount: fresh socket. Every post-park connection that dies before
		// attaching must count as a failed attempt — a stale _connAttached
		// carried over from the parked (attached) session would skip the first
		// one and delay the outage diagnosis by a dial.
		connect(transport, terminal, "ws://host/terminal/t1");
		const redial = FakeRelaySocket.instances.at(-1);
		if (!redial) throw new Error("expected relay socket instance");
		redial.open();
		redial.drop(1006, "host went away before attach");

		expect(transport._attachRetry.consecutiveFailures).toBe(1);
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
