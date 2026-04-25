import {
	normalizeTerminalTitle,
	parseConEmuOsc9Title,
} from "@superset/shared/terminal-title";
import type { Terminal as XTerm } from "@xterm/xterm";

export type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string; title?: string | null }
	| { type: "title"; title: string | null };

type TerminalClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" }
	| { type: "title"; title: string | null };

export interface TerminalTransport {
	socket: WebSocket | null;
	connectionState: ConnectionState;
	/** The URL the socket is currently connected (or connecting) to. */
	currentUrl: string | null;
	onDataDisposable: { dispose(): void } | null;
	stateListeners: Set<() => void>;
	/** Internal: auto-reconnect timer. */
	_reconnectTimer: ReturnType<typeof setTimeout> | null;
	/** Internal: reconnect attempt count for backoff. */
	_reconnectAttempt: number;
	/** The xterm instance used for reconnection. */
	_terminal: XTerm | null;
	/** Set when the server sends an exit message — no reconnect after this. */
	_exited: boolean;
	/** Latest title emitted by terminal title sequences. */
	title: string | null;
	onTitleDisposable: { dispose(): void } | null;
	onTitleTokenDisposable: { dispose(): void } | null;
}

function setConnectionState(
	transport: TerminalTransport,
	state: ConnectionState,
) {
	transport.connectionState = state;
	notifyStateListeners(transport);
}

function notifyStateListeners(transport: TerminalTransport) {
	for (const listener of transport.stateListeners) {
		listener();
	}
}

function setTitle(transport: TerminalTransport, title: string | null): boolean {
	const normalizedTitle = normalizeTerminalTitle(title);
	if (transport.title === normalizedTitle) return false;
	transport.title = normalizedTitle;
	notifyStateListeners(transport);
	return true;
}

function sendClientMessage(
	socket: WebSocket,
	message: TerminalClientMessage,
): void {
	if (socket.readyState !== WebSocket.OPEN) return;
	socket.send(JSON.stringify(message));
}

function sendTitle(transport: TerminalTransport, socket: WebSocket): void {
	sendClientMessage(socket, { type: "title", title: transport.title });
}

const MAX_RECONNECT_DELAY = 10_000;
const BASE_RECONNECT_DELAY = 500;
const MAX_RECONNECT_ATTEMPTS = 10;

export function createTransport(): TerminalTransport {
	return {
		socket: null,
		connectionState: "disconnected",
		currentUrl: null,
		onDataDisposable: null,
		stateListeners: new Set(),
		_reconnectTimer: null,
		_reconnectAttempt: 0,
		_terminal: null,
		_exited: false,
		title: null,
		onTitleDisposable: null,
		onTitleTokenDisposable: null,
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
	let replayTitleSuppressDepth = 0;

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

		if (message.type === "data") {
			terminal.write(message.data);
			return;
		}

		if (message.type === "replay") {
			const hasAuthoritativeTitle = message.title != null;
			if (hasAuthoritativeTitle) {
				setTitle(transport, message.title ?? null);
				replayTitleSuppressDepth += 1;
			}
			terminal.write(message.data, () => {
				if (hasAuthoritativeTitle) {
					replayTitleSuppressDepth = Math.max(0, replayTitleSuppressDepth - 1);
				}
			});
			return;
		}

		if (message.type === "title") {
			setTitle(transport, message.title);
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
		sendClientMessage(socket, { type: "input", data });
	});
	transport.onTitleDisposable?.dispose();
	transport.onTitleDisposable = terminal.onTitleChange((title) => {
		if (replayTitleSuppressDepth > 0) return;
		if (setTitle(transport, title || null)) {
			sendTitle(transport, socket);
		}
	});
	transport.onTitleTokenDisposable?.dispose();
	transport.onTitleTokenDisposable = terminal.parser.registerOscHandler(
		9,
		(data) => {
			const title = parseConEmuOsc9Title(data);
			if (title === undefined) return false;
			if (replayTitleSuppressDepth > 0) return true;
			if (setTitle(transport, title)) {
				sendTitle(transport, socket);
			}
			return true;
		},
	);
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
	setConnectionState(transport, "disconnected");
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
	transport.onTitleDisposable?.dispose();
	transport.onTitleDisposable = null;
	transport.onTitleTokenDisposable?.dispose();
	transport.onTitleTokenDisposable = null;
}

export function sendResize(
	transport: TerminalTransport,
	cols: number,
	rows: number,
) {
	if (!transport.socket || transport.socket.readyState !== WebSocket.OPEN)
		return;
	sendClientMessage(transport.socket, { type: "resize", cols, rows });
}

export function sendInput(transport: TerminalTransport, data: string) {
	if (!transport.socket || transport.socket.readyState !== WebSocket.OPEN)
		return;
	sendClientMessage(transport.socket, { type: "input", data });
}

export function sendDispose(transport: TerminalTransport) {
	if (transport.socket?.readyState === WebSocket.OPEN) {
		sendClientMessage(transport.socket, { type: "dispose" });
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
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
	transport.onTitleDisposable?.dispose();
	transport.onTitleDisposable = null;
	transport.onTitleTokenDisposable?.dispose();
	transport.onTitleTokenDisposable = null;
	transport.stateListeners.clear();
}
