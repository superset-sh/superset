import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	connect,
	createTransport,
	disposeTransport,
	type TerminalExitEvent,
} from "./terminal-ws-transport";

type FakeSocketEvent = { data?: string };
type FakeSocketListener = (event: FakeSocketEvent) => void;

class FakeWebSocket {
	static readonly OPEN = 1;
	static instances: FakeWebSocket[] = [];

	readyState = FakeWebSocket.OPEN;
	readonly listeners = new Map<string, FakeSocketListener[]>();
	readonly sent: string[] = [];

	constructor(readonly url: string) {
		FakeWebSocket.instances.push(this);
	}

	addEventListener(type: string, listener: FakeSocketListener) {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	close() {
		this.readyState = 3;
	}

	send(data: string) {
		this.sent.push(data);
	}

	emit(type: string, event: FakeSocketEvent = {}) {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}
}

const originalWebSocket = globalThis.WebSocket;

function installFakeWebSocket() {
	(globalThis as { WebSocket: typeof WebSocket }).WebSocket =
		FakeWebSocket as unknown as typeof WebSocket;
}

function createTerminal() {
	return {
		cols: 80,
		rows: 24,
		write: mock(() => {}),
		writeln: mock(() => {}),
		onData: mock(() => ({ dispose: mock(() => {}) })),
	} as unknown as XTerm;
}

describe("terminal-ws-transport", () => {
	afterEach(() => {
		(globalThis as { WebSocket: typeof WebSocket }).WebSocket =
			originalWebSocket;
		FakeWebSocket.instances = [];
	});

	it("notifies exit listeners when the server reports terminal exit", () => {
		installFakeWebSocket();
		const transport = createTransport();
		const exitEvents: TerminalExitEvent[] = [];
		const onExit = mock((event: TerminalExitEvent) => {
			exitEvents.push(event);
		});
		transport.exitListeners.add(onExit);

		connect(transport, createTerminal(), "ws://terminal.test/session");
		const socket = FakeWebSocket.instances[0];
		expect(socket).toBeDefined();

		socket?.emit("message", {
			data: JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }),
		});

		expect(onExit).toHaveBeenCalledTimes(1);
		expect(exitEvents).toEqual([{ exitCode: 0, signal: 0 }]);

		disposeTransport(transport);
	});
});
