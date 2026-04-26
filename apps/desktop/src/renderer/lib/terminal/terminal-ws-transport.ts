import type { Terminal as XTerm } from "@xterm/xterm";

export type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string }
	| { type: "title"; title: string | null };

export interface TerminalTransport {
	socket: WebSocket | null;
	connectionState: ConnectionState;
	/** The URL the socket is currently connected (or connecting) to. */
	currentUrl: string | null;
	title: string | null | undefined;
	onDataDisposable: { dispose(): void } | null;
	stateListeners: Set<() => void>;
	titleListeners: Set<() => void>;
	/** Internal: auto-reconnect timer. */
	_reconnectTimer: ReturnType<typeof setTimeout> | null;
	/** Internal: reconnect attempt count for backoff. */
	_reconnectAttempt: number;
	/** The xterm instance used for reconnection. */
	_terminal: XTerm | null;
	/** Set when the server sends an exit message — no reconnect after this. */
	_exited: boolean;
}

function setConnectionState(
	transport: TerminalTransport,
	state: ConnectionState,
) {
	transport.connectionState = state;
	for (const listener of transport.stateListeners) {
		listener();
	}
}

function setTerminalTitle(
	transport: TerminalTransport,
	title: string | null | undefined,
) {
	if (transport.title === title) return;
	transport.title = title;
	for (const listener of transport.titleListeners) {
		listener();
	}
}

const MAX_RECONNECT_DELAY = 10_000;
const BASE_RECONNECT_DELAY = 500;
const MAX_RECONNECT_ATTEMPTS = 10;

export function createTransport(): TerminalTransport {
	return {
		socket: null,
		connectionState: "disconnected",
		currentUrl: null,
		title: undefined,
		onDataDisposable: null,
		stateListeners: new Set(),
		titleListeners: new Set(),
		_reconnectTimer: null,
		_reconnectAttempt: 0,
		_terminal: null,
		_exited: false,
	};
}

function scheduleReconnect(transport: TerminalTransport) {
	if (transport._reconnectTimer) return;
	if (transport._exited) return;
	if (!transport.currentUrl || !transport._terminal) return;
	if (transport._reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;

	const delay = Math.min(
		BASE_RECONNECT_DELAY * 2 ** transport._reconnectAttempt,
		MAX_RECONNECT_DELAY,
	);
	transport._reconnectAttempt++;

	transport._reconnectTimer = setTimeout(() => {
		transport._reconnectTimer = null;
		if (
			transport.connectionState === "closed" &&
			transport.currentUrl &&
			transport._terminal
		) {
			connect(transport, transport._terminal, transport.currentUrl);
		}
	}, delay);
}

function cancelReconnect(transport: TerminalTransport) {
	if (transport._reconnectTimer) {
		clearTimeout(transport._reconnectTimer);
		transport._reconnectTimer = null;
	}
}

export function connect(
	transport: TerminalTransport,
	terminal: XTerm,
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

	cancelReconnect(transport);
	transport.currentUrl = wsUrl;
	transport._terminal = terminal;
	transport._exited = false;
	setConnectionState(transport, "connecting");
	const socket = new WebSocket(wsUrl);
	transport.socket = socket;

	socket.addEventListener("open", () => {
		if (transport.socket !== socket) return;
		transport._reconnectAttempt = 0;
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

		if (message.type === "title") {
			setTerminalTitle(transport, message.title);
			return;
		}

		if (message.type === "error") {
			terminal.writeln(`\r\n[terminal] ${message.message}`);
			return;
		}

		if (message.type === "exit") {
			transport._exited = true;
			cancelReconnect(transport);
			terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		}
	});

	socket.addEventListener("close", () => {
		if (transport.socket !== socket) return;
		setConnectionState(transport, "closed");
		transport.socket = null;
		// Auto-reconnect on unexpected close (host-service restart, network blip)
		scheduleReconnect(transport);
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
	cancelReconnect(transport);
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport.currentUrl = null;
	transport._terminal = null;
	transport._reconnectAttempt = 0;
	setTerminalTitle(transport, undefined);
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

export function sendInput(transport: TerminalTransport, data: string) {
	if (!transport.socket || transport.socket.readyState !== WebSocket.OPEN)
		return;
	transport.socket.send(JSON.stringify({ type: "input", data }));
}

export function sendDispose(transport: TerminalTransport) {
	if (transport.socket?.readyState === WebSocket.OPEN) {
		transport.socket.send(JSON.stringify({ type: "dispose" }));
	}
}

export function disposeTransport(transport: TerminalTransport) {
	cancelReconnect(transport);
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport.currentUrl = null;
	transport._terminal = null;
	transport._reconnectAttempt = 0;
	setTerminalTitle(transport, undefined);
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
	transport.stateListeners.clear();
	transport.titleListeners.clear();
}
