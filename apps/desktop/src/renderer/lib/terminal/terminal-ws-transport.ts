import type { RelayAffinityProbe } from "@superset/workspace-client";
import {
	createRelaySocket,
	type RelaySocket,
} from "@superset/workspace-client/relay-socket";
import type { Terminal as XTerm } from "@xterm/xterm";
import { ensureFreshJwt } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";
import {
	classifyTerminalFailure,
	type TerminalFailureClassification,
} from "./terminalConnectionDiagnostics";
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
	connectionState: ConnectionState;
	/** The token-bearing URL the socket is currently pointed at. */
	currentUrl: string | null;
	title: string | null | undefined;
	stateListeners: Set<() => void>;
	titleListeners: Set<() => void>;
	/**
	 * Transport-level status log (WebSocket close/error/reconnect notices).
	 * Surfaced to the pane UI instead of being written into the xterm buffer,
	 * so terminal scrollback stays clean.
	 */
	logs: TerminalLogEntry[];
	logListeners: Set<() => void>;
	/**
	 * Why the connection is down, once it has failed enough consecutive attempts
	 * to be worth surfacing (or access was denied / the session ended). Null
	 * while healthy or within the transient-blip window. Drives the pane header
	 * status indicator.
	 */
	lastDiagnosis: TerminalFailureClassification | null;

	/** Internal: the shared reconnecting relay socket (partysocket). Created
	 * once on first connect; it re-signs the URL and runs the relay preflight
	 * before every (re)dial and retries indefinitely. */
	_socket: RelaySocket | null;
	/** The xterm instance the socket feeds. */
	_terminal: XTerm | null;
	/** Internal: disposes the terminal.onData → socket.send wiring. */
	_onDataDisposable: { dispose(): void } | null;
	/** Internal: title-change debounce timer; see TITLE_COALESCE_MS. */
	_titleNotifyTimer: ReturnType<typeof setTimeout> | null;
	/**
	 * Batches PTY output into one xterm.write per animation frame. Agent CLIs
	 * emit repaints as many small chunks; per-chunk writes trigger a
	 * parse/render cycle each and overwhelm the renderer (#2241, #2244).
	 */
	_writeCoalescer: WriteCoalescer | null;
	/**
	 * Whether the give-up diagnosis has already been logged for the current
	 * outage, so the one-shot log + telemetry don't repeat every retry cycle.
	 * Reset on attach and on a forced reconnect. The failure *count* itself is
	 * read live from the socket's `retryCount` (see maybeSurfaceDiagnosis).
	 */
	_diagnosisLogged: boolean;
	/** Internal: last `_whoowns` preflight probe, used to classify a failure. */
	_lastProbe: RelayAffinityProbe | null;
	/**
	 * Token carried on the URL the caller passed. Reused as-is for local (PSK)
	 * hosts, whose token doesn't rotate; relay hosts re-sign per dial via
	 * ensureFreshJwt and ignore this.
	 */
	_localToken: string | null;
	/** Set when the server signals the session is done (PTY exit / fatal attach
	 * error) or access is denied. Suppresses the auto-reconnect loop. */
	_terminated: boolean;
	/**
	 * Flips true after the first PTY-output frame lands in xterm. Subsequent
	 * dials send `?replay=0` so the server doesn't re-deliver scrollback.
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
}

const MAX_LOG_ENTRIES = 200;
let logIdCounter = 0;

const BASE_RECONNECT_DELAY = 500;
const MAX_RECONNECT_DELAY = 10_000;
// How many consecutive failed dials (partysocket `retryCount`) before the header
// shows *why* the terminal is down. Below this the socket is quietly (and
// quickly) retrying — a network blip or host-service restart usually recovers
// inside the window (retryCount resets after a stable connection). The socket
// keeps retrying forever regardless; this only gates the user-facing diagnosis.
const DIAGNOSE_AFTER_ATTEMPTS = 10;

function isWindowHidden(): boolean {
	return typeof document !== "undefined" && document.hidden;
}

// Once partysocket has failed DIAGNOSE_AFTER_ATTEMPTS consecutive dials, surface
// why the terminal is down. Driven off partysocket's `retryCount` — the
// authoritative per-attempt counter that increments on every failed dial and
// resets after a stable connection — rather than counting close events: dial
// failures (host unreachable, upgrade rejected) arrive as synthetic string-code
// closes + error events that a hand-rolled close-counter misses, so a purely
// close-counting gate would leave a genuinely-offline terminal retrying
// silently with no header explanation. The socket keeps retrying forever
// regardless; this only decides when (and whether) the header explains it.
function maybeSurfaceDiagnosis(
	transport: TerminalTransport,
	closeEvent: { code?: unknown; reason?: unknown } | null,
) {
	if (transport._terminated) return;
	// A hidden/minimized window shouldn't accrue an "offline" state nobody is
	// looking at — its failures may be a suspend artifact. The socket keeps
	// retrying; the resume listener force-redials the moment it's back.
	if (isWindowHidden()) return;
	if ((transport._socket?.retryCount ?? 0) < DIAGNOSE_AFTER_ATTEMPTS) return;

	// Keep the header diagnosis fresh every cycle; log + emit telemetry once.
	const diagnosis = classifyTerminalFailure(
		transport._lastProbe,
		isRelayHostUrl(transport.currentUrl),
	);
	transport.lastDiagnosis = diagnosis;
	if (transport._diagnosisLogged) return;
	transport._diagnosisLogged = true;
	pushLog(
		transport,
		"warn",
		`Terminal disconnected from ${formatWsEndpoint(transport.currentUrl)}. ${diagnosis.message} Still retrying.`,
	);
	posthog.capture("terminal_connect_failed", {
		endpoint: formatWsEndpoint(transport.currentUrl),
		close_code:
			closeEvent && typeof closeEvent.code === "number"
				? closeEvent.code
				: null,
		close_reason:
			closeEvent && typeof closeEvent.reason === "string"
				? closeEvent.reason || undefined
				: undefined,
		preflight_status: transport._lastProbe?.status ?? null,
		tunnel_region: transport._lastProbe?.region ?? null,
		reconnect_attempts: transport._socket?.retryCount ?? 0,
		category: diagnosis.category,
	});
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

export function createTransport(): TerminalTransport {
	return {
		connectionState: "disconnected",
		currentUrl: null,
		title: undefined,
		stateListeners: new Set(),
		titleListeners: new Set(),
		logs: [],
		logListeners: new Set(),
		lastDiagnosis: null,
		_socket: null,
		_terminal: null,
		_onDataDisposable: null,
		_titleNotifyTimer: null,
		_writeCoalescer: null,
		_diagnosisLogged: false,
		_lastProbe: null,
		_localToken: null,
		_terminated: false,
		_hasReceivedBytes: false,
		_livenessTimer: null,
		_lastLivenessTick: 0,
		_resumeListener: null,
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

// Force an immediate re-dial without waiting for a `close` event that a
// half-open socket will never deliver. partysocket.reconnect() resets its retry
// counter and dials now; the host keeps the PTY alive, so this just re-attaches
// (and replays anything missed).
function forceReconnect(transport: TerminalTransport) {
	if (transport._terminated) return;
	const socket = transport._socket;
	if (!socket) return;
	transport._diagnosisLogged = false;
	transport.lastDiagnosis = null;
	setConnectionState(transport, "connecting");
	// reconnect() also resets partysocket's retryCount, so the diagnosis budget
	// starts fresh.
	socket.reconnect();
}

// DOM resume signal (online/focus/visibilitychange). Reconnect only if the
// socket is actually dead — a healthy or still-connecting socket is left alone.
function handleResume(transport: TerminalTransport) {
	if (transport._terminated) return;
	const socket = transport._socket;
	if (!socket) return;
	if (
		socket.readyState === WebSocket.OPEN ||
		socket.readyState === WebSocket.CONNECTING
	) {
		return;
	}
	forceReconnect(transport);
}

function setupLiveness(transport: TerminalTransport) {
	if (transport._livenessTimer === null) {
		transport._lastLivenessTick = Date.now();
		transport._livenessTimer = setInterval(() => {
			const now = Date.now();
			const gap = now - transport._lastLivenessTick;
			transport._lastLivenessTick = now;
			if (gap > LIVENESS_SUSPEND_GAP_MS) forceReconnect(transport);
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

function formatCloseDetails(event: {
	code?: unknown;
	reason?: unknown;
}): string {
	const code = typeof event.code === "number" ? event.code : "unknown";
	const reason =
		typeof event.reason === "string" && event.reason
			? `, reason: ${event.reason}`
			: "";
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

function extractToken(url: string): string | null {
	try {
		return new URL(url).searchParams.get("token");
	} catch {
		return null;
	}
}

// The URL minus its token param. createRelaySocket signs a fresh token onto it
// before every dial, so the persisted base must not carry a stale one.
function stripToken(url: string): string {
	try {
		const u = new URL(url);
		u.searchParams.delete("token");
		return u.toString();
	} catch {
		return url;
	}
}

export function connect(
	transport: TerminalTransport,
	terminal: XTerm,
	wsUrl: string,
) {
	const base = stripToken(wsUrl);

	// Idempotent: a live socket already pointed at this endpoint just needs the
	// latest token-bearing URL refreshed (the socket re-signs per dial anyway) —
	// don't tear the connection down when only the rotating token changed.
	if (
		transport._socket &&
		!transport._terminated &&
		transport.currentUrl &&
		stripToken(transport.currentUrl) === base
	) {
		transport.currentUrl = wsUrl;
		transport._localToken = extractToken(wsUrl);
		return;
	}

	transport.currentUrl = wsUrl;
	transport._localToken = extractToken(wsUrl);
	transport._terminal = terminal;
	transport._terminated = false;
	transport._diagnosisLogged = false;
	transport.lastDiagnosis = null;
	// Recreate per connect so the coalescer always targets the current terminal;
	// dispose flushes anything the previous socket left pending.
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = createWriteCoalescer((data) =>
		terminal.write(data),
	);
	setupLiveness(transport);
	setConnectionState(transport, "connecting");

	// Endpoint changed on an existing socket: re-point (buildUrl reads
	// currentUrl live) and re-dial.
	if (transport._socket) {
		transport._socket.reconnect();
		return;
	}

	const socket = createRelaySocket({
		name: "desktop-terminal",
		// buildUrl/getToken read transport state live, so a URL swap or token
		// rotation is picked up on the next dial without recreating the socket.
		buildUrl: () => {
			const current = stripToken(transport.currentUrl ?? base);
			return transport._hasReceivedBytes
				? appendQueryParam(current, "replay", "0")
				: current;
		},
		getToken: () =>
			isRelayHostUrl(transport.currentUrl)
				? ensureFreshJwt()
				: transport._localToken,
		// 403 is a definitive access denial (fresh token), not transient —
		// createRelaySocket closes the socket; record why so we stop looking.
		onAccessDenied: () => {
			transport._terminated = true;
			const diagnosis = classifyTerminalFailure(transport._lastProbe, true);
			transport.lastDiagnosis = diagnosis;
			setConnectionState(transport, "closed");
			pushLog(
				transport,
				"error",
				`Connection refused for ${formatWsEndpoint(transport.currentUrl)}: ${diagnosis.message} Not retrying.`,
			);
			posthog.capture("terminal_connect_failed", {
				endpoint: formatWsEndpoint(transport.currentUrl),
				preflight_status: transport._lastProbe?.status ?? null,
				tunnel_region: transport._lastProbe?.region ?? null,
				reconnect_attempts: transport._socket?.retryCount ?? 0,
				category: diagnosis.category,
			});
		},
		onProbe: (probe) => {
			transport._lastProbe = probe;
		},
		minReconnectionDelay: BASE_RECONNECT_DELAY,
		maxReconnectionDelay: MAX_RECONNECT_DELAY,
		// send() is a no-op unless open; we gate writes on connectionState anyway.
		maxEnqueuedMessages: 0,
	});
	// Receive PTY bytes as ArrayBuffer (the default Blob forces an async read);
	// we feed bytes synchronously into xterm.write to keep render order strict.
	socket.binaryType = "arraybuffer";
	transport._socket = socket;
	attachSocketListeners(transport, terminal, socket);
}

function attachSocketListeners(
	transport: TerminalTransport,
	terminal: XTerm,
	socket: RelaySocket,
): void {
	socket.addEventListener("message", (event) => {
		// Ignore events from a socket we've detached (teardown nulls _socket).
		if (transport._socket !== socket) return;
		const data = (event as { data: unknown }).data;

		// Binary frame = PTY output bytes (data + replay collapsed onto one
		// channel; renderer treats them identically). Pipe straight into xterm.
		if (data instanceof ArrayBuffer) {
			// Queue PTY bytes; the coalescer batches them into one xterm.write per
			// animation frame. There's no output ACK back to host-service:
			// back-pressure lives entirely on the host side, which bounds this
			// socket's send buffer and drops us (we reconnect and replay) if we
			// fall hopelessly behind. A slow renderer can never wedge the shell —
			// it just loses some scrollback.
			transport._writeCoalescer?.push(new Uint8Array(data));
			transport._hasReceivedBytes = true;
			return;
		}

		let message: TerminalServerMessage;
		try {
			message = JSON.parse(String(data)) as TerminalServerMessage;
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
			transport.lastDiagnosis = null;
			transport._diagnosisLogged = false;
			setConnectionState(transport, "open");
			sendResize(transport, terminal.cols, terminal.rows);
			return;
		}

		if (message.type === "error") {
			transport.lastDiagnosis = {
				category: "unknown",
				message: message.message,
			};
			pushLog(transport, "error", message.message);
			// Server closes after this; reconnecting would just hit the same error.
			transport._terminated = true;
			socket.close();
			return;
		}

		if (message.type === "exit") {
			transport._writeCoalescer?.flushSync();
			transport._terminated = true;
			transport.lastDiagnosis = {
				category: "unknown",
				message: `The terminal session ended (exit code ${message.exitCode}).`,
			};
			socket.close();
			terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		}
	});

	socket.addEventListener("close", (event) => {
		// Ignore a late close from a socket we've detached, so it can't overwrite
		// the "disconnected" state or mutate logs after teardown.
		if (transport._socket !== socket) return;
		const closeEvent = event as { code?: unknown; reason?: unknown };
		// Render whatever arrived before the close instead of holding it for a
		// frame that may never come (e.g. hidden window).
		transport._writeCoalescer?.flushSync();
		setConnectionState(transport, "closed");
		// Deliberate/terminal closes (PTY exit, fatal error, cleanup) don't
		// reconnect — partysocket won't re-dial after close(). Synthetic
		// dial-error closes carry a string code and are logged via the error
		// handler; the diagnosis itself is driven off retryCount either way.
		if (transport._terminated || closeEvent.code === 1000) return;

		// Log real server closes (numeric code) below the threshold; past it the
		// header diagnosis conveys the state, and a hidden window shouldn't spam.
		if (
			typeof closeEvent.code === "number" &&
			!isWindowHidden() &&
			(transport._socket?.retryCount ?? 0) < DIAGNOSE_AFTER_ATTEMPTS
		) {
			pushLog(
				transport,
				"warn",
				`WebSocket closed while connected to ${formatWsEndpoint(transport.currentUrl)} (${formatCloseDetails(closeEvent)}). Reconnecting (attempt ${transport._socket?.retryCount ?? 0}/${DIAGNOSE_AFTER_ATTEMPTS})...`,
			);
		}
		maybeSurfaceDiagnosis(transport, closeEvent);
	});

	socket.addEventListener("error", () => {
		if (transport._socket !== socket) return;
		if (transport._terminated) return;
		// Below the diagnosis threshold, surface the transient error; past it the
		// header diagnosis already conveys "offline", so stop logging an identical
		// error every retry cycle. A hidden window stays quiet.
		if (
			!isWindowHidden() &&
			(transport._socket?.retryCount ?? 0) < DIAGNOSE_AFTER_ATTEMPTS
		) {
			pushLog(
				transport,
				"error",
				`WebSocket error while connecting to ${formatWsEndpoint(transport.currentUrl)}. Check host-service or relay connectivity.`,
			);
		}
		// Dial failures (host unreachable, upgrade rejected) surface ONLY as error
		// + a synthetic close, so drive the diagnosis from here too.
		maybeSurfaceDiagnosis(transport, null);
	});

	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = terminal.onData((data) => {
		if (transport.connectionState !== "open") return;
		if (socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "input", data }));
	});
}

/**
 * Manually re-dial after the transport stopped trying (access denied, fatal
 * server error, PTY exit) or to force an immediate reconnect. Clears the
 * terminated flag and resets the attempt budget.
 */
export function reconnect(transport: TerminalTransport) {
	if (!transport._socket || !transport.currentUrl) return;
	transport._terminated = false;
	transport._diagnosisLogged = false;
	transport.lastDiagnosis = null;
	setConnectionState(transport, "connecting");
	// reconnect() also resets partysocket's retryCount → fresh diagnosis budget.
	transport._socket.reconnect();
}

export function disconnect(transport: TerminalTransport) {
	teardownLiveness(transport);
	if (transport._socket) {
		transport._socket.close();
		transport._socket = null;
	}
	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = null;
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	transport.currentUrl = null;
	transport._terminal = null;
	transport._diagnosisLogged = false;
	transport._terminated = false;
	transport.lastDiagnosis = null;
	setTerminalTitle(transport, undefined);
	setConnectionState(transport, "disconnected");
}

export function sendResize(
	transport: TerminalTransport,
	cols: number,
	rows: number,
) {
	const socket = transport._socket;
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	if (transport.connectionState !== "open") return;
	socket.send(JSON.stringify({ type: "resize", cols, rows }));
}

export function sendInput(transport: TerminalTransport, data: string) {
	const socket = transport._socket;
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	if (transport.connectionState !== "open") return;
	socket.send(JSON.stringify({ type: "input", data }));
}

export function sendDispose(transport: TerminalTransport) {
	if (transport._socket?.readyState === WebSocket.OPEN) {
		transport._socket.send(JSON.stringify({ type: "dispose" }));
	}
}

export function disposeTransport(transport: TerminalTransport) {
	teardownLiveness(transport);
	if (transport._socket) {
		transport._socket.close();
		transport._socket = null;
	}
	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = null;
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	transport.currentUrl = null;
	transport._terminal = null;
	transport._diagnosisLogged = false;
	transport._terminated = false;
	transport.lastDiagnosis = null;
	setTerminalTitle(transport, undefined);
	transport.stateListeners.clear();
	if (transport._titleNotifyTimer !== null) {
		clearTimeout(transport._titleNotifyTimer);
		transport._titleNotifyTimer = null;
	}
	transport.titleListeners.clear();
	transport.logs = [];
	transport.logListeners.clear();
}
