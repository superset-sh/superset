import type { Terminal as GhosttyTerminal } from "ghostty-web";

export type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string };

export interface TerminalTransport {
	socket: WebSocket | null;
	connectionState: ConnectionState;
	/** The URL the socket is currently connected (or connecting) to. */
	currentUrl: string | null;
	onDataDisposable: { dispose(): void } | null;
	stateListeners: Set<() => void>;
}

export function setConnectionState(
	transport: TerminalTransport,
	state: ConnectionState,
) {
	transport.connectionState = state;
	for (const listener of transport.stateListeners) {
		listener();
	}
}

export function createTransport(): TerminalTransport {
	return {
		socket: null,
		connectionState: "disconnected",
		currentUrl: null,
		onDataDisposable: null,
		stateListeners: new Set(),
	};
}

export function connect(
	transport: TerminalTransport,
	terminal: GhosttyTerminal,
	wsUrl: string,
) {
	// Idempotent: skip if already connected/connecting to the same endpoint.
	const isActive =
		transport.connectionState === "open" ||
		transport.connectionState === "connecting";
	if (isActive && transport.currentUrl === wsUrl) return;

	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}

	transport.currentUrl = wsUrl;
	setConnectionState(transport, "connecting");
	const socket = new WebSocket(wsUrl);
	transport.socket = socket;

	socket.addEventListener("open", () => {
		if (transport.socket !== socket) return;
		setConnectionState(transport, "open");
		sendResize(transport, terminal.cols, terminal.rows);
	});

	socket.addEventListener("message", (event) => {
		if (transport.socket !== socket) return;
		let message: TerminalServerMessage;
		try {
			message = JSON.parse(String(event.data)) as TerminalServerMessage;
		} catch {
			terminal.writeln("\r\n[terminal] invalid server payload");
			return;
		}

		if (message.type === "data" || message.type === "replay") {
			terminal.write(message.data);
			return;
		}

		if (message.type === "error") {
			terminal.writeln(`\r\n[terminal] ${message.message}`);
			return;
		}

		if (message.type === "exit") {
			terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		}
	});

	socket.addEventListener("close", () => {
		if (transport.socket !== socket) return;
		setConnectionState(transport, "closed");
		transport.socket = null;
	});

	socket.addEventListener("error", () => {
		if (transport.socket !== socket) return;
		terminal.writeln("\r\n[terminal] websocket error");
	});

	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = terminal.onData((data) => {
		if (socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "input", data }));
	});
}

export function disconnect(transport: TerminalTransport) {
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport.currentUrl = null;
	setConnectionState(transport, "disconnected");
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
}

export function sendResize(
	transport: TerminalTransport,
	cols: number,
	rows: number,
) {
	if (!transport.socket || transport.socket.readyState !== WebSocket.OPEN)
		return;
	transport.socket.send(JSON.stringify({ type: "resize", cols, rows }));
}

export function sendDispose(transport: TerminalTransport) {
	if (transport.socket?.readyState === WebSocket.OPEN) {
		transport.socket.send(JSON.stringify({ type: "dispose" }));
	}
}

export function disposeTransport(transport: TerminalTransport) {
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport.currentUrl = null;
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
	transport.stateListeners.clear();
}
