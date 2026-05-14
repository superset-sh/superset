import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	connect,
	createTransport,
	disposeTransport,
} from "./terminal-ws-transport";

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

function createMockTerminal(
	cols = 101,
	rows = 27,
): XTerm & {
	disposedInputListenerCount(): number;
	emitData(data: string): void;
} {
	const dataListeners: Array<{
		disposed: boolean;
		listener: (data: string) => void;
	}> = [];
	return {
		cols,
		rows,
		onData: (listener: (data: string) => void) => {
			const record = { disposed: false, listener };
			dataListeners.push(record);
			return {
				dispose() {
					record.disposed = true;
				},
			};
		},
		disposedInputListenerCount() {
			return dataListeners.filter((record) => record.disposed).length;
		},
		emitData(data: string) {
			for (const record of dataListeners) {
				if (!record.disposed) record.listener(data);
			}
		},
		write() {},
		writeln() {},
	} as unknown as XTerm & {
		disposedInputListenerCount(): number;
		emitData(data: string): void;
	};
}

beforeEach(() => {
	MockWebSocket.instances = [];
	globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
});

describe("terminal-ws-transport", () => {
	test("can suppress replay on the initial connect when xterm already has content", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1", undefined, {
			replay: false,
		});

		const socket = MockWebSocket.instances[0];
		expect(socket?.url).toBe("ws://host/terminal/t1?replay=0");
	});

	test("skips replay after PTY bytes have already landed", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");
		const firstSocket = MockWebSocket.instances[0];
		if (!firstSocket) throw new Error("expected first websocket instance");
		firstSocket.message(new Uint8Array([1, 2, 3]).buffer);

		connect(transport, terminal, "ws://host/terminal/t2");

		const secondSocket = MockWebSocket.instances[1];
		expect(secondSocket?.url).toBe("ws://host/terminal/t2?replay=0");
	});

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

	test("reconnecting replaces the previous xterm input subscription", () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");
		const firstSocket = MockWebSocket.instances[0];
		if (!firstSocket) throw new Error("expected first websocket instance");
		firstSocket.open();
		firstSocket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));

		connect(transport, terminal, "ws://host/terminal/t2");
		const secondSocket = MockWebSocket.instances[1];
		if (!secondSocket) throw new Error("expected second websocket instance");
		secondSocket.open();
		secondSocket.message(
			JSON.stringify({ type: "attached", terminalId: "t2" }),
		);
		terminal.emitData("x");

		expect(firstSocket.readyState).toBe(MockWebSocket.CLOSED);
		expect(terminal.disposedInputListenerCount()).toBe(1);
		expect(firstSocket.sent.map((payload) => JSON.parse(payload))).toEqual([
			{ type: "resize", cols: 101, rows: 27 },
		]);
		expect(secondSocket.sent.map((payload) => JSON.parse(payload))).toEqual([
			{ type: "resize", cols: 101, rows: 27 },
			{ type: "input", data: "x" },
		]);
	});

	test("dispose clears pending reconnect and title timers", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const titleListener = mock(() => {});
		const logListener = mock(() => {});
		transport.titleListeners.add(titleListener);
		transport.logListeners.add(logListener);

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = MockWebSocket.instances[0];
		if (!socket) throw new Error("expected websocket instance");
		socket.open();
		socket.message(JSON.stringify({ type: "title", title: "busy" }));
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		socket.close(1006, "lost");

		expect(transport._titleNotifyTimer).not.toBeNull();
		expect(transport._reconnectTimer).not.toBeNull();

		disposeTransport(transport);

		expect(transport._titleNotifyTimer).toBeNull();
		expect(transport._reconnectTimer).toBeNull();
		expect(transport._writeOutput).toBeNull();
		expect(transport.titleListeners.size).toBe(0);
		expect(transport.logListeners.size).toBe(0);

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(titleListener).not.toHaveBeenCalled();
		expect(logListener).toHaveBeenCalledTimes(1);
	});
});
