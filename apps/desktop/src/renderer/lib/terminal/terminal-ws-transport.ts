import {
	primeRelayAffinity,
	type RelayAffinityProbe,
} from "@superset/workspace-client";
import type { Terminal as XTerm } from "@xterm/xterm";
import { posthog } from "renderer/lib/posthog";
import { classifyTerminalFailure } from "./terminalConnectionDiagnostics";
import { createWriteCoalescer, type WriteCoalescer } from "./write-coalescer";

export type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

export type TerminalLogLevel = "info" | "warn" | "error";

export interface TerminalLogEntry {
	id: number;
	timestamp: number;
	level: TerminalLogLevel;
	message: string;
}

// PTY output bytes arrive as binary WebSocket frames and are fed straight
// into xterm.write(Uint8Array) — no UTF-8 decoding hop, so multi-byte
// codepoints that straddle a frame boundary stay intact (xterm.js buffers
// partial sequences internally). Control messages (title/error/exit) stay
// JSON.
type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
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
	/**
	 * Transport-level status log (WebSocket close/error/reconnect notices).
	 * Surfaced to the pane UI instead of being written into the xterm buffer,
	 * so terminal scrollback stays clean.
	 */
	logs: TerminalLogEntry[];
	logListeners: Set<() => void>;
	/** Internal: auto-reconnect timer. */
	_reconnectTimer: ReturnType<typeof setTimeout> | null;
	/** Internal: reconnect attempt count for backoff. */
	_reconnectAttempt: number;
	/** Internal: title-change debounce timer; see TITLE_COALESCE_MS. */
	_titleNotifyTimer: ReturnType<typeof setTimeout> | null;
	/** The xterm instance used for reconnection. */
	_terminal: XTerm | null;
	/** Set when the server signals the session is done (PTY exit or fatal
	 * attach error). Suppresses the auto-reconnect loop. */
	_terminated: boolean;
	/**
	 * Flips true after the first PTY-output frame lands in xterm. Subsequent
	 * connects send `?replay=0` so the server doesn't re-deliver scrollback.
	 * Tracked on first bytes (not first open) so a WS that opens-and-closes
	 * with no output still gets replay on the next connect.
	 */
	_hasReceivedBytes: boolean;
	/** Internal: wall-clock-gap watchdog for laptop sleep/wake detection. */
	_livenessTimer: ReturnType<typeof setInterval> | null;
	/** Internal: Date.now() at the last watchdog tick. */
	_lastLivenessTick: number;
	/** Internal: bound resume handler shared by the online/focus/visibility
	 * listeners, so they can be removed on teardown. */
	_resumeListener: (() => void) | null;
	/**
	 * Internal: batches PTY output into one xterm.write per animation frame.
	 * Agent CLIs emit repaints as many small chunks; per-chunk writes trigger
	 * a parse/render cycle each and overwhelm the renderer (#2241, #2244).
	 */
	_writeCoalescer: WriteCoalescer | null;
	/** Internal: last `_whoowns` probe, used to explain a failed connection. */
	_lastProbe: RelayAffinityProbe | null;
}

const MAX_LOG_ENTRIES = 200;
let logIdCounter = 0;

function setConnectionState(
	transport: TerminalTransport,
	state: ConnectionState,
) {
	transport.connectionState = state;
	for (const listener of transport.stateListeners) {
		listener();
	}
}

// Debounce window for title-change notifications. transport.title updates
// immediately so getTitle() reads the latest; only listener notifications wait,
// preventing flicker when shells retitle rapidly. Matches ghostty's 75ms.
const TITLE_COALESCE_MS = 75;

function notifyTitleListeners(transport: TerminalTransport) {
	transport._titleNotifyTimer = null;
	for (const listener of transport.titleListeners) {
		listener();
	}
}

function setTerminalTitle(
	transport: TerminalTransport,
	title: string | null | undefined,
) {
	if (transport.title === title) return;
	transport.title = title;
	if (transport._titleNotifyTimer !== null) {
		clearTimeout(transport._titleNotifyTimer);
	}
	transport._titleNotifyTimer = setTimeout(
		() => notifyTitleListeners(transport),
		TITLE_COALESCE_MS,
	);
}

function pushLog(
	transport: TerminalTransport,
	level: TerminalLogLevel,
	message: string,
) {
	logIdCounter += 1;
	const entry: TerminalLogEntry = {
		id: logIdCounter,
		timestamp: Date.now(),
		level,
		message,
	};
	const next =
		transport.logs.length >= MAX_LOG_ENTRIES
			? [
					...transport.logs.slice(transport.logs.length - MAX_LOG_ENTRIES + 1),
					entry,
				]
			: [...transport.logs, entry];
	transport.logs = next;
	for (const listener of transport.logListeners) {
		listener();
	}
}

export function clearLogs(transport: TerminalTransport) {
	if (transport.logs.length === 0) return;
	transport.logs = [];
	for (const listener of transport.logListeners) {
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
		logs: [],
		logListeners: new Set(),
		_reconnectTimer: null,
		_titleNotifyTimer: null,
		_reconnectAttempt: 0,
		_terminal: null,
		_hasReceivedBytes: false,
		_terminated: false,
		_livenessTimer: null,
		_lastLivenessTick: 0,
		_resumeListener: null,
		_writeCoalescer: null,
		_lastProbe: null,
	};
}

// Wall-clock watchdog cadence and the gap that counts as a suspend. A tick gap
// far larger than the interval means the process was paused (laptop sleep), so
// any socket still reporting OPEN is almost certainly half-open — dead, but
// without a `close` event ever firing. This is the dependable desktop signal:
// app-suspend doesn't reliably fire focus/visibility when the window was
// focused both before and after sleep.
const LIVENESS_CHECK_INTERVAL_MS = 5_000;
const LIVENESS_SUSPEND_GAP_MS = 20_000;

// Drop the current socket and immediately reconnect, without waiting for a
// `close` event that a half-open socket will never deliver. The host keeps the
// PTY alive, so this just re-attaches (and replays anything missed).
function reconnectNow(transport: TerminalTransport) {
	if (transport._terminated) return;
	if (!transport.currentUrl || !transport._terminal) return;
	cancelReconnect(transport);
	if (transport.socket) {
		const dead = transport.socket;
		transport.socket = null;
		try {
			dead.close();
		} catch {
			// best-effort; the close handler is a no-op once socket is detached
		}
	}
	transport._reconnectAttempt = 0;
	// connect() is idempotent while "open"/"connecting"; force "closed" so it
	// actually re-dials the now-detached socket.
	setConnectionState(transport, "closed");
	connect(transport, transport._terminal, transport.currentUrl);
}

// DOM resume signal (online/focus/visibilitychange). Reset backoff and
// reconnect only if the socket is actually dead — a healthy or still-connecting
// socket is left alone. Mirrors TerminalConnection.handleResume on web.
function handleResume(transport: TerminalTransport) {
	if (transport._terminated) return;
	if (!transport.currentUrl || !transport._terminal) return;
	transport._reconnectAttempt = 0;
	// Bail if a connect is already in flight. State "connecting" also covers the
	// /hosts/ pre-flight window, where transport.socket is still null but
	// reconnecting would orphan the socket the pending pre-flight is about to open.
	const socket = transport.socket;
	if (
		transport.connectionState === "connecting" ||
		socket?.readyState === WebSocket.OPEN
	) {
		return;
	}
	reconnectNow(transport);
}

function setupLiveness(transport: TerminalTransport) {
	if (transport._livenessTimer === null) {
		transport._lastLivenessTick = Date.now();
		transport._livenessTimer = setInterval(() => {
			const now = Date.now();
			const gap = now - transport._lastLivenessTick;
			transport._lastLivenessTick = now;
			if (gap > LIVENESS_SUSPEND_GAP_MS) reconnectNow(transport);
		}, LIVENESS_CHECK_INTERVAL_MS);
	}
	if (!transport._resumeListener) {
		const listener = () => handleResume(transport);
		transport._resumeListener = listener;
		if (typeof window !== "undefined") {
			window.addEventListener("online", listener);
			window.addEventListener("focus", listener);
		}
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", listener);
		}
	}
}

function teardownLiveness(transport: TerminalTransport) {
	if (transport._livenessTimer !== null) {
		clearInterval(transport._livenessTimer);
		transport._livenessTimer = null;
	}
	const listener = transport._resumeListener;
	if (listener) {
		if (typeof window !== "undefined") {
			window.removeEventListener("online", listener);
			window.removeEventListener("focus", listener);
		}
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", listener);
		}
		transport._resumeListener = null;
	}
}

function scheduleReconnect(transport: TerminalTransport) {
	if (transport._reconnectTimer) return;
	if (transport._terminated) return;
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

function formatWsEndpoint(wsUrl: string | null): string {
	if (!wsUrl) return "unknown endpoint";
	try {
		const url = new URL(wsUrl);
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		return "invalid terminal WebSocket URL";
	}
}

// Relay-routed terminals live under `/hosts/<id>/...`; local ones don't.
function isRelayHostUrl(wsUrl: string | null): boolean {
	if (!wsUrl) return false;
	try {
		return new URL(wsUrl).pathname.startsWith("/hosts/");
	} catch {
		return false;
	}
}

function formatCloseDetails(event: CloseEvent): string {
	const code = event.code || "unknown";
	const reason = event.reason ? `, reason: ${event.reason}` : "";
	return `code: ${code}${reason}`;
}

function appendQueryParam(url: string, key: string, value: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set(key, value);
		return u.toString();
	} catch {
		// URL parse failed (relative url, malformed). Fall back to naive append.
		const sep = url.includes("?") ? "&" : "?";
		return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
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
	// Recreate per connect so the coalescer always targets the current
	// terminal; dispose flushes anything the previous socket left pending.
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = createWriteCoalescer((data) =>
		terminal.write(data),
	);
	transport._terminated = false;
	setupLiveness(transport);
	setConnectionState(transport, "connecting");
	const actualUrl = transport._hasReceivedBytes
		? appendQueryParam(wsUrl, "replay", "0")
		: wsUrl;

	const openSocket = () => {
		// Bail if the transport raced into a different URL or was disconnected
		// while the pre-flight was in flight.
		if (
			transport.currentUrl !== wsUrl ||
			transport.connectionState !== "connecting"
		) {
			return;
		}
		let socket: WebSocket;
		try {
			socket = new WebSocket(actualUrl);
		} catch (err) {
			pushLog(
				transport,
				"error",
				`WebSocket construction failed for ${formatWsEndpoint(actualUrl)}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			setConnectionState(transport, "closed");
			scheduleReconnect(transport);
			return;
		}
		// Receive PTY bytes as ArrayBuffer (the default would be Blob, which
		// forces an async read); we want to feed bytes synchronously into
		// xterm.write to keep render order strict.
		socket.binaryType = "arraybuffer";
		transport.socket = socket;
		attachSocketListeners(transport, terminal, socket);
	};

	// Pre-flight `_whoowns` to pin fly edge affinity before the WS upgrade (see
	// primeRelayAffinity); skip for non-/hosts URLs. Probe `wsUrl`, not the
	// `replay`-carrying `actualUrl`, and keep the result to explain a failure.
	if (isRelayHostUrl(wsUrl)) {
		transport._lastProbe = null;
		void primeRelayAffinity(wsUrl).then((probe) => {
			transport._lastProbe = probe;
			openSocket();
		});
	} else {
		openSocket();
	}
}

function attachSocketListeners(
	transport: TerminalTransport,
	terminal: XTerm,
	socket: WebSocket,
): void {
	socket.addEventListener("open", () => {
		if (transport.socket !== socket) return;
		transport._reconnectAttempt = 0;
	});

	socket.addEventListener("message", (event) => {
		if (transport.socket !== socket) return;

		// Binary frame = PTY output bytes (data + replay collapsed onto one
		// channel; renderer treats them identically). Pipe straight into
		// xterm without any decoding step.
		if (event.data instanceof ArrayBuffer) {
			// Queue PTY bytes; the coalescer batches them into one xterm.write
			// per animation frame. There's no output ACK back to host-service:
			// back-pressure lives entirely on the host side, which bounds this
			// socket's send buffer and drops us (we reconnect and replay) if we
			// fall hopelessly behind. That means a slow/stalled renderer can
			// never wedge the shell — it just loses some scrollback.
			transport._writeCoalescer?.push(new Uint8Array(event.data));
			transport._hasReceivedBytes = true;
			return;
		}

		let message: TerminalServerMessage;
		try {
			message = JSON.parse(String(event.data)) as TerminalServerMessage;
		} catch {
			transport._writeCoalescer?.flushSync();
			terminal.writeln("\r\n[terminal] invalid server payload");
			return;
		}

		if (message.type === "title") {
			setTerminalTitle(transport, message.title);
			return;
		}

		if (message.type === "attached") {
			setConnectionState(transport, "open");
			sendResize(transport, terminal.cols, terminal.rows);
			return;
		}

		if (message.type === "error") {
			pushLog(transport, "error", message.message);
			// Server closes after this; reconnecting would just hit the same error.
			transport._terminated = true;
			cancelReconnect(transport);
			return;
		}

		if (message.type === "exit") {
			transport._writeCoalescer?.flushSync();
			transport._terminated = true;
			cancelReconnect(transport);
			terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		}
	});

	socket.addEventListener("close", (event) => {
		if (transport.socket !== socket) return;
		// Render whatever arrived before the close instead of holding it for a
		// frame that may never come (e.g. hidden window).
		transport._writeCoalescer?.flushSync();
		setConnectionState(transport, "closed");
		transport.socket = null;
		if (!transport._terminated && event.code !== 1000) {
			const willReconnect =
				!transport._reconnectTimer &&
				Boolean(transport.currentUrl && transport._terminal) &&
				transport._reconnectAttempt < MAX_RECONNECT_ATTEMPTS;
			const endpoint = formatWsEndpoint(transport.currentUrl);
			if (willReconnect) {
				pushLog(
					transport,
					"warn",
					`WebSocket closed while connected to ${endpoint} (${formatCloseDetails(event)}). Reconnecting...`,
				);
			} else {
				// Gave up. Classify why from the preflight probe and record it so
				// this failure mode is queryable, not silent.
				const diagnosis = classifyTerminalFailure(
					transport._lastProbe,
					isRelayHostUrl(transport.currentUrl),
				);
				pushLog(
					transport,
					"error",
					`WebSocket closed while connected to ${endpoint} (${formatCloseDetails(event)}). Max reconnect attempts reached. ${diagnosis.message}`,
				);
				posthog.capture("terminal_connect_failed", {
					endpoint,
					close_code: event.code,
					close_reason: event.reason || undefined,
					preflight_status: transport._lastProbe?.status ?? null,
					tunnel_region: transport._lastProbe?.region ?? null,
					reconnect_attempts: transport._reconnectAttempt,
					category: diagnosis.category,
				});
			}
		}
		// Auto-reconnect on unexpected close (host-service restart, network blip)
		scheduleReconnect(transport);
	});

	socket.addEventListener("error", () => {
		if (transport.socket !== socket) return;
		pushLog(
			transport,
			"error",
			`WebSocket error while connecting to ${formatWsEndpoint(transport.currentUrl)}. Check host-service or relay connectivity.`,
		);
	});

	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = terminal.onData((data) => {
		if (socket.readyState !== WebSocket.OPEN) return;
		if (transport.connectionState !== "open") return;
		socket.send(JSON.stringify({ type: "input", data }));
	});
}

export function disconnect(transport: TerminalTransport) {
	cancelReconnect(transport);
	teardownLiveness(transport);
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
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
	if (transport.connectionState !== "open") return;
	transport.socket.send(JSON.stringify({ type: "resize", cols, rows }));
}

export function sendInput(transport: TerminalTransport, data: string) {
	if (!transport.socket || transport.socket.readyState !== WebSocket.OPEN)
		return;
	if (transport.connectionState !== "open") return;
	transport.socket.send(JSON.stringify({ type: "input", data }));
}

export function sendDispose(transport: TerminalTransport) {
	if (transport.socket?.readyState === WebSocket.OPEN) {
		transport.socket.send(JSON.stringify({ type: "dispose" }));
	}
}

export function disposeTransport(transport: TerminalTransport) {
	cancelReconnect(transport);
	teardownLiveness(transport);
	if (transport.socket) {
		transport.socket.close();
		transport.socket = null;
	}
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	transport.currentUrl = null;
	transport._terminal = null;
	transport._reconnectAttempt = 0;
	setTerminalTitle(transport, undefined);
	transport.onDataDisposable?.dispose();
	transport.onDataDisposable = null;
	transport.stateListeners.clear();
	if (transport._titleNotifyTimer !== null) {
		clearTimeout(transport._titleNotifyTimer);
		transport._titleNotifyTimer = null;
	}
	transport.titleListeners.clear();
	transport.logs = [];
	transport.logListeners.clear();
}
