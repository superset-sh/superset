import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

	close() {
		this.readyState = MockWebSocket.CLOSED;
		this.dispatch("close", { code: 1000, reason: "" });
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

beforeEach(() => {
	MockWebSocket.instances = [];
	globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
});

describe("terminal-ws-transport", () => {
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
