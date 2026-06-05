import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { connect, createTransport } from "./terminal-ws-transport";

type Listener = (event: {
	data?: unknown;
	code?: number;
	reason?: string;
}) => void;

class MockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.CONNECTING;
	binaryType: BinaryType = "blob";
	sent: string[] = [];
	private readonly listeners = new Map<string, Set<Listener>>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	addEventListener(type: string, listener: Listener) {
		let listeners = this.listeners.get(type);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(type, listeners);
		}
		listeners.add(listener);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close(code = 1000, reason = "") {
		this.readyState = MockWebSocket.CLOSED;
		this.dispatch("close", { code, reason });
	}

	open() {
		this.readyState = MockWebSocket.OPEN;
		this.dispatch("open", {});
	}

	message(data: unknown) {
		this.dispatch("message", { data });
	}

	private dispatch(type: string, event: Parameters<Listener>[0]) {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}
}

const originalWebSocket = globalThis.WebSocket;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

// Captured watchdog intervals, so tests can fire ticks deterministically and no
// real interval leaks past a test.
const intervalCallbacks = new Map<number, () => void>();
let intervalIdCounter = 0;

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

function fireWatchdogTicks() {
	for (const fn of [...intervalCallbacks.values()]) fn();
}

beforeEach(() => {
	MockWebSocket.instances = [];
	globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
	intervalCallbacks.clear();
	intervalIdCounter = 0;
	globalThis.setInterval = ((fn: () => void) => {
		const id = ++intervalIdCounter;
		intervalCallbacks.set(id, fn);
		return id as unknown as ReturnType<typeof setInterval>;
	}) as typeof setInterval;
	globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
		if (id != null) intervalCallbacks.delete(id as unknown as number);
	}) as typeof clearInterval;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
	globalThis.setInterval = originalSetInterval;
	globalThis.clearInterval = originalClearInterval;
	setSystemTime();
});

describe("terminal-ws-transport", () => {
	test("server-sent error routes to logs, not xterm, and stops reconnect", () => {
		const transport = createTransport();
		const writelnCalls: string[] = [];
		const terminal = createMockTerminal();
		(terminal as unknown as { writeln: (s: string) => void }).writeln = (
			s: string,
		) => {
			writelnCalls.push(s);
		};

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = MockWebSocket.instances[0];
		if (!socket) throw new Error("expected websocket instance");
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

		// 1011 is what host-service sends after an attach error; the close
		// handler would otherwise schedule a reconnect.
		socket.close(1011, "session not active");
		expect(transport._reconnectTimer).toBeNull();
	});

	// Repro for #5130: after a laptop sleep the remote terminal's WebSocket goes
	// half-open (TCP dead, but readyState stays OPEN and no `close` ever fires).
	// With only close-driven reconnect the pane sits on a dead pipe forever. A
	// wall-clock-gap watchdog must notice the suspend and recycle the socket.
	test("recovers a half-open socket after a sleep/wake wall-clock gap", () => {
		setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");
		const first = MockWebSocket.instances[0];
		if (!first) throw new Error("expected websocket instance");
		first.open();
		first.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
		expect(MockWebSocket.instances).toHaveLength(1);

		// Lid closes. The socket dies but never emits `close` and stays OPEN — we
		// deliberately never call first.close(); that is the bug. Two minutes later
		// the user reopens the laptop, and the next watchdog tick sees a wall-clock
		// gap far larger than its interval.
		setSystemTime(new Date("2026-01-01T00:02:00Z"));
		fireWatchdogTicks();

		// A healthy transport drops the dead pipe and re-attaches. On main only one
		// socket is ever created and this stays at length 1.
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(transport.connectionState).toBe("connecting");

		// The fresh socket attaches and the pane is interactive again.
		const second = MockWebSocket.instances[1];
		if (!second) throw new Error("expected reconnected websocket instance");
		second.open();
		second.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");
	});

	test("waits for server attach before sending resize or input", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		if (!socket) throw new Error("expected websocket instance");
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
});
