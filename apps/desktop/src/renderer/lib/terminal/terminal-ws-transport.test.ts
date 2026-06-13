import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	setSystemTime,
	test,
} from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { setJwt } from "../auth-client";
import { connect, createTransport, sendResize } from "./terminal-ws-transport";

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
const originalFetch = globalThis.fetch;

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
	globalThis.fetch = Object.assign(
		async () => new Response(null, { status: 200 }),
		originalFetch,
	) as typeof fetch;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
	globalThis.fetch = originalFetch;
	setJwt(null);
	setSystemTime();
	jest.useRealTimers();
});

function createUnsignedJwt(payload: Record<string, unknown>): string {
	return [
		"header",
		Buffer.from(JSON.stringify(payload)).toString("base64url"),
		"signature",
	].join(".");
}

async function nextSocket(index = 0): Promise<MockWebSocket> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		await Promise.resolve();
		const socket = MockWebSocket.instances[index];
		if (socket) return socket;
	}
	throw new Error("expected websocket instance");
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("terminal-ws-transport", () => {
	test("server-sent error routes to logs, not xterm, and stops reconnect", async () => {
		const transport = createTransport();
		const writelnCalls: string[] = [];
		const terminal = createMockTerminal();
		(terminal as unknown as { writeln: (s: string) => void }).writeln = (
			s: string,
		) => {
			writelnCalls.push(s);
		};

		connect(transport, terminal, "ws://host/terminal/t1");
		const socket = await nextSocket();
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

	test("waits for server attach before sending resize or input", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");

		const socket = await nextSocket();
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

	test("does not resize shared terminals when attached as a secondary observer", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(transport, terminal, "ws://host/terminal/t1");

		const socket = await nextSocket();
		const sentMessages = () =>
			socket.sent.map((payload) => JSON.parse(payload) as unknown);

		socket.open();
		socket.message(
			JSON.stringify({
				type: "attached",
				terminalId: "t1",
				canResize: false,
			}),
		);

		expect(transport.connectionState).toBe("open");
		expect(transport.canResize).toBe(false);
		expect(sentMessages()).toEqual([]);

		sendResize(transport, 120, 40);
		terminal.emitData("b");
		expect(sentMessages()).toEqual([{ type: "input", data: "b" }]);
	});

	test("recovers a half-open socket after the machine resumes from sleep", async () => {
		jest.useFakeTimers();
		setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const transport = createTransport();
		connect(transport, createMockTerminal(), "ws://host/terminal/t1");

		const socket = await nextSocket();
		socket.open();
		socket.message(JSON.stringify({ type: "attached", terminalId: "t1" }));
		expect(transport.connectionState).toBe("open");

		// Laptop sleeps: the socket dies but never observes it. readyState stays
		// OPEN and no `close` is delivered — that silent death is the bug. Two
		// minutes pass (clock jumps), then the watchdog tick runs on wake.
		setSystemTime(new Date("2026-01-01T00:02:00Z"));
		jest.advanceTimersByTime(120_000);
		await nextSocket(1);

		// Recovery: the wall-clock-gap watchdog drops the wedged socket and dials
		// a fresh one. Without it, only the original socket would ever exist.
		expect(MockWebSocket.instances.length).toBe(2);
	});

	test("refreshes relay URL token from current JWT before opening socket", async () => {
		const transport = createTransport();
		const terminal = createMockTerminal();
		const freshToken = createUnsignedJwt({ exp: 4_102_444_800 });
		setJwt(freshToken);

		connect(
			transport,
			terminal,
			"ws://relay.test/hosts/org:machine/terminal/t1?token=stale&workspaceId=ws1",
		);

		const socket = await nextSocket();
		const url = new URL(socket.url);

		expect(url.searchParams.get("token")).toBe(freshToken);
		expect(url.searchParams.get("workspaceId")).toBe("ws1");
		expect(socket.url).not.toContain("token=stale");
	});

	test("does not open relay terminal websocket when host preflight reports unavailable", async () => {
		jest.useFakeTimers();
		const freshToken = createUnsignedJwt({ exp: 4_102_444_800 });
		setJwt(freshToken);
		globalThis.fetch = Object.assign(
			async () => new Response(null, { status: 503 }),
			originalFetch,
		) as typeof fetch;

		const transport = createTransport();
		const terminal = createMockTerminal();

		connect(
			transport,
			terminal,
			"ws://relay.test/hosts/org:offline/terminal/t1?token=stale",
		);

		await flushPromises();

		expect(MockWebSocket.instances).toHaveLength(0);
		expect(transport.connectionState).toBe("closed");
		expect(transport.logs.at(-1)?.level).toBe("warn");
		expect(transport.logs.at(-1)?.message).toContain("Host is unavailable");
		expect(transport._reconnectTimer).not.toBeNull();

		jest.advanceTimersByTime(29_999);
		await flushPromises();

		expect(MockWebSocket.instances).toHaveLength(0);
	});
});
