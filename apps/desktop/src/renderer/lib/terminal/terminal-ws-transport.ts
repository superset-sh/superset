import { DIAL_TIMEOUT_MS } from "@superset/shared/tunnel-protocol";
import type { RelayHostProbe } from "@superset/workspace-client";
import {
	createRelaySocket,
	type RelaySocket,
} from "@superset/workspace-client/relay-socket";
import type { Terminal as XTerm } from "@xterm/xterm";
import { ensureFreshJwt } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";
import {
	type AttachRetryState,
	clearAttachRetryableMessage,
	createAttachRetryState,
	DIAGNOSE_AFTER_ATTEMPTS,
	effectiveFailureCount,
	noteAttachRetryableMessage,
	recordFailedConnection,
	resetAttachRetryState,
	shouldSurfaceDiagnosis,
} from "./attach-retry-diagnosis";
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
	// `code: "session-gone"` = the server says the session is permanently
	// destroyed (not found / disposed / exited), not a transient attach failure.
	| { type: "error"; message: string; code?: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "title"; title: string | null }
	// Stream-position anchor from a seq-aware host. Arrives after any
	// host-synthesized bytes (mode preamble/notice) and before catch-up/live
	// PTY bytes; sets our counter and arms per-frame counting so the next
	// dial can request exactly the bytes we missed. Old hosts never send it.
	| {
			type: "synced";
			epoch: string;
			seq: number;
			mode: "exact" | "tail" | "reanchor";
	  };

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
	/**
	 * True once the server has said the PTY is gone for good (live `exit`
	 * message or a `session-gone` attach error). Distinct from `_terminated`,
	 * which also covers access denials and unknown errors where the PTY may
	 * still be alive. Persistence paths must clear — never write — the
	 * persisted scrollback of a session-ended terminal. Reset on `attached`
	 * (the session was re-created under the same id).
	 */
	sessionEnded: boolean;

	/** Internal: invoked once each time the session-ended signal arrives, so
	 * the owner can drop persisted scrollback immediately. */
	_onSessionEnded: (() => void) | null;
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
	/**
	 * Consecutive attach-retryable failures + the server's latest reason.
	 * partysocket's retryCount resets after 5s of uptime, and a wedged-daemon
	 * cycle keeps the WS open ~15s before failing — so this counter, reset
	 * only on a real `attached`, is what actually reaches the diagnosis
	 * threshold for that outage (see attach-retry-diagnosis.ts).
	 */
	_attachRetry: AttachRetryState;
	/** Internal: the current connection delivered `attached` — its close is a
	 * disconnect, not a failed attempt. Reset in the close handler. */
	_connAttached: boolean;
	/** Internal: the current connection got an attach-retryable error frame
	 * (already logged); its guaranteed follow-up close skips the generic log. */
	_connHadRetryableError: boolean;
	/** Internal: last `_whoowns` preflight probe, used to classify a failure. */
	_lastProbe: RelayHostProbe | null;
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
	/**
	 * Position in the host's output stream: every byte of `epoch` up to `seq`
	 * has been written into this xterm. Seeded from the persisted anchor on
	 * runtime rebuild, re-anchored by each `synced` message, advanced by every
	 * counted binary frame. Sent as `?seq=` on each dial so the host can
	 * deliver exactly the missed bytes.
	 */
	seqAnchor: { epoch: string; seq: number } | null;
	/**
	 * Armed by `synced`, disarmed on attach/close. While disarmed, binary
	 * frames are host-synthesized (mode preamble/notice) or from a pre-seq
	 * host and must not advance the anchor.
	 */
	_seqCounting: boolean;
	/**
	 * True once any connection on this transport delivered a `synced` — i.e.
	 * the host speaks seq and every PTY byte since has been counted. Decides
	 * whether the anchor survives persistence (see getPersistableSeqAnchor).
	 */
	_seqEverSynced: boolean;
	/** Binary frames arrived on the current connection (reset on `attached`).
	 * With `_seqCounting` still false at close time, it means a pre-seq host
	 * fed the xterm uncounted bytes — the anchor is invalidated. */
	_bytesSinceAttach: boolean;
	/**
	 * True when the xterm was born with content (restored snapshot or seeded
	 * from a sibling instance). Without an anchor, such an xterm must never
	 * request the ring tail (`seq=new`) — it would double-paint.
	 */
	_xtermHadContent: boolean;
	/** Internal: wall-clock-gap watchdog for laptop sleep/wake detection. */
	_livenessTimer: ReturnType<typeof setInterval> | null;
	/** Internal: Date.now() at the last watchdog tick. */
	_lastLivenessTick: number;
	/** Internal: bound resume handler shared by the online/focus/visibility
	 * listeners, so they can be removed on teardown. */
	_resumeListener: (() => void) | null;
	/**
	 * Internal: removes the textarea focus/blur listeners that keep the
	 * host's declared focus state current. The host aggregates the declared
	 * state across sockets, so it must track live focus changes — xterm's
	 * in-band \x1b[I/\x1b[O reports bypass that aggregation.
	 */
	_disposeFocusListeners: (() => void) | null;
	/**
	 * Whether this pane is on screen. The host sizes the PTY to the smallest
	 * visible client, so a parked pane's dims must stop counting — otherwise a
	 * hidden narrow split would squeeze the terminal the user is looking at.
	 * Held here rather than read at send time because it has to be re-declared
	 * on every attach: a reconnecting socket starts out assumed visible.
	 */
	_visible: boolean;
}

const MAX_LOG_ENTRIES = 200;
let logIdCounter = 0;

const BASE_RECONNECT_DELAY = 500;
const MAX_RECONNECT_DELAY = 10_000;

function isWindowHidden(): boolean {
	return typeof document !== "undefined" && document.hidden;
}

// Once partysocket has failed DIAGNOSE_AFTER_ATTEMPTS consecutive dials, surface
// why the terminal is down. Driven off the max of partysocket's `retryCount`
// (per-dial counter — covers dial failures that arrive as synthetic
// string-code closes + error events a close-counter would miss) and our own
// attach-retryable streak (covers the wedged-daemon cycle, where each failed
// attempt holds the WS open past partysocket's 5s minUptime and retryCount
// keeps resetting to 0). The socket keeps retrying forever regardless; this
// only decides when (and whether) the header explains it.
function maybeSurfaceDiagnosis(
	transport: TerminalTransport,
	closeEvent: { code?: unknown; reason?: unknown } | null,
) {
	if (transport._terminated) return;
	// A hidden/minimized window shouldn't accrue an "offline" state nobody is
	// looking at — its failures may be a suspend artifact. The socket keeps
	// retrying; the resume listener force-redials the moment it's back.
	if (isWindowHidden()) return;
	if (
		!shouldSurfaceDiagnosis(
			transport._attachRetry,
			transport._socket?.retryCount ?? 0,
		)
	) {
		return;
	}

	// Keep the header diagnosis fresh every cycle; log + emit telemetry once.
	// An attach-retryable reason (daemon stalled) beats the probe
	// classification — the connection itself is fine in that outage. It's
	// cleared whenever a connection fails some other way, so it always
	// describes the CURRENT failure mode, never a past blip.
	const diagnosis: TerminalFailureClassification = transport._attachRetry
		.lastMessage
		? { category: "unknown", message: transport._attachRetry.lastMessage }
		: classifyTerminalFailure(
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
		reconnect_attempts: effectiveFailureCount(
			transport._attachRetry,
			transport._socket?.retryCount ?? 0,
		),
		category: diagnosis.category,
	});
}

function markSessionEnded(transport: TerminalTransport) {
	if (transport.sessionEnded) return;
	transport.sessionEnded = true;
	transport._onSessionEnded?.();
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

export function createTransport(
	options: { onSessionEnded?: () => void } = {},
): TerminalTransport {
	return {
		connectionState: "disconnected",
		currentUrl: null,
		title: undefined,
		stateListeners: new Set(),
		titleListeners: new Set(),
		logs: [],
		logListeners: new Set(),
		lastDiagnosis: null,
		sessionEnded: false,
		_onSessionEnded: options.onSessionEnded ?? null,
		_socket: null,
		_terminal: null,
		_onDataDisposable: null,
		_titleNotifyTimer: null,
		_writeCoalescer: null,
		_diagnosisLogged: false,
		_attachRetry: createAttachRetryState(),
		_connAttached: false,
		_connHadRetryableError: false,
		_lastProbe: null,
		_localToken: null,
		_terminated: false,
		_hasReceivedBytes: false,
		seqAnchor: null,
		_seqCounting: false,
		_seqEverSynced: false,
		_bytesSinceAttach: false,
		_xtermHadContent: false,
		_livenessTimer: null,
		_lastLivenessTick: 0,
		_resumeListener: null,
		_disposeFocusListeners: null,
		_visible: true,
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
	resetAttachRetryState(transport._attachRetry);
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

	// Seq capability is a property of the endpoint, not the transport: a
	// re-point can land on a different host-service generation, and a
	// `_seqEverSynced` latched from the old endpoint would let park() close a
	// socket the new (legacy) host cannot replay. The next `synced` re-latches
	// it. `_hasReceivedBytes` deliberately stays: it guards a legacy host from
	// double-painting its whole FIFO into an xterm that already has content.
	if (transport.currentUrl && stripToken(transport.currentUrl) !== base) {
		transport._seqEverSynced = false;
	}
	transport.currentUrl = wsUrl;
	transport._localToken = extractToken(wsUrl);
	transport._terminal = terminal;
	// Keep the host's declared focus state current across live focus changes,
	// not just at attach — the host writes the aggregate across all attached
	// clients, so a pane whose focus only travelled in-band would be invisible
	// to it and an unfocused sibling could clobber the program's state.
	if (!transport._disposeFocusListeners && terminal.textarea) {
		const textarea = terminal.textarea;
		const send = () => sendFocusState(transport);
		textarea.addEventListener("focus", send);
		textarea.addEventListener("blur", send);
		transport._disposeFocusListeners = () => {
			textarea.removeEventListener("focus", send);
			textarea.removeEventListener("blur", send);
		};
	}
	transport._terminated = false;
	transport._diagnosisLogged = false;
	transport.lastDiagnosis = null;
	resetAttachRetryState(transport._attachRetry);
	// Recreate per connect so the coalescer always targets the current terminal;
	// dispose flushes anything the previous socket left pending.
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = createWriteCoalescer((data, done) =>
		terminal.write(data, done),
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
		// buildUrl/getToken read transport state live, so a URL swap or token
		// rotation is picked up on the next dial without recreating the socket.
		buildUrl: () => {
			let current = stripToken(transport.currentUrl ?? base);
			// Legacy replay suppression — read by pre-seq hosts only.
			if (transport._hasReceivedBytes) {
				current = appendQueryParam(current, "replay", "0");
			}
			// Stream position for seq-aware hosts: exact anchor when we have
			// one; "new" (dump the tail) only for a genuinely virgin xterm;
			// "none" (reanchor, send nothing) when the xterm has content of
			// unknown position. Pre-seq hosts ignore the param.
			const anchor = transport.seqAnchor;
			const seqValue = anchor
				? `${anchor.epoch}:${anchor.seq}`
				: transport._xtermHadContent || transport._hasReceivedBytes
					? "none"
					: "new";
			return appendQueryParam(current, "seq", seqValue);
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
				reconnect_attempts: transport._socket?.retryCount ?? 0,
				category: diagnosis.category,
			});
		},
		onProbe: (probe) => {
			transport._lastProbe = probe;
		},
		minReconnectionDelay: BASE_RECONNECT_DELAY,
		maxReconnectionDelay: MAX_RECONNECT_DELAY,
		// The relay holds the upgrade until the host dials back, up to
		// DIAL_TIMEOUT_MS. partysocket's 4s default cancelled attempts the host
		// was still answering, and every retry cost the host another dial.
		connectionTimeout: DIAL_TIMEOUT_MS + 2_000,
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
			// animation frame and holds the next batch until xterm reports the
			// last one parsed. There's no output ACK back to host-service:
			// socket-level back-pressure lives entirely on the host side, which
			// bounds this socket's send buffer and drops us (we reconnect and
			// catch up by seq) if we fall hopelessly behind. A slow renderer can
			// never wedge the shell.
			if (transport._seqCounting && transport.seqAnchor) {
				transport.seqAnchor.seq += data.byteLength;
			}
			transport._writeCoalescer?.push(new Uint8Array(data));
			transport._hasReceivedBytes = true;
			transport._bytesSinceAttach = true;
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
			// Only a real attach ends the failure streak — WS opens don't count
			// (a wedged daemon serves a successful upgrade every failed cycle).
			transport._connAttached = true;
			resetAttachRetryState(transport._attachRetry);
			// A successful attach means the session exists again (re-created or
			// respawned under the same id) — its scrollback is worth keeping.
			transport.sessionEnded = false;
			// Counting stays disarmed until this attach's `synced` arrives —
			// bytes before it are host-synthesized (preamble/notice) or from a
			// pre-seq host, and neither advances the stream position.
			transport._seqCounting = false;
			transport._bytesSinceAttach = false;
			setConnectionState(transport, "open");
			sendVisibleState(transport);
			sendResize(transport, terminal.cols, terminal.rows);
			return;
		}

		if (message.type === "synced") {
			transport.seqAnchor = { epoch: message.epoch, seq: message.seq };
			transport._seqCounting = true;
			transport._seqEverSynced = true;
			// Re-assert current keyboard focus so the running program's focus
			// state can't stay stale across the reattach (tmux does the same on
			// client attach). xterm's own DECSET-1004 self-report fires while
			// the preamble parses, but on a rebuilt pane it can read the focus
			// class before pane focus settles and report the wrong state — so
			// this must land at the PTY *after* that report. `synced` arrives
			// behind the preamble frame: flush it into xterm, then queue an
			// empty write whose callback runs once the preamble (and any
			// self-report it triggered) has parsed. The host forwards the state
			// only when the program enabled mode 1004.
			transport._writeCoalescer?.flushSync();
			terminal.write("", () => sendFocusState(transport));
			return;
		}

		if (message.type === "error") {
			// Transient host-side attach failure (pty-daemon stalled/restarting).
			// Don't mark terminated: the server closes the socket and partysocket's
			// capped-backoff loop keeps re-dialing the same create-on-attach URL, so
			// the pane becomes a live shell once the daemon recovers (host-side
			// inflight dedupe + already-exists adoption keep the retry idempotent).
			if (message.code === "attach-retryable") {
				// The failure is COUNTED by the close handler (every connection
				// that never attached counts once); here we just record the
				// server's reason and log it. The guaranteed follow-up close
				// carries the 1013 into the diagnosis + telemetry.
				noteAttachRetryableMessage(transport._attachRetry, message.message);
				transport._connHadRetryableError = true;
				if (
					!isWindowHidden() &&
					effectiveFailureCount(
						transport._attachRetry,
						transport._socket?.retryCount ?? 0,
					) < DIAGNOSE_AFTER_ATTEMPTS
				) {
					pushLog(
						transport,
						"warn",
						`Terminal not ready: ${message.message} Retrying automatically.`,
					);
				}
				return;
			}
			transport.lastDiagnosis = {
				category: "unknown",
				message: message.message,
			};
			pushLog(transport, "error", message.message);
			if (message.code === "session-gone") {
				// The session is permanently destroyed — reconnecting can't revive it.
				transport._terminated = true;
				markSessionEnded(transport);
				socket.close();
				return;
			}
			// Any other error may be transient (e.g. a daemon-open timeout while the
			// pty-daemon is stalled). The server closes the socket after this frame;
			// let that close drive the normal reconnect/backoff path instead of
			// terminating — a later attempt re-runs create-on-attach and succeeds
			// once the host recovers.
			return;
		}

		if (message.type === "exit") {
			transport._writeCoalescer?.flushSync();
			transport._terminated = true;
			markSessionEnded(transport);
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
		// A connection that delivered bytes but never a `synced` was a pre-seq
		// host (downgrade skew): those bytes advanced the xterm without
		// advancing the anchor, so the anchor is poisoned — drop it rather
		// than let a later exact catch-up re-deliver painted bytes.
		if (transport._bytesSinceAttach && !transport._seqCounting) {
			transport.seqAnchor = null;
		}
		// Otherwise the anchor keeps its last-counted position and the next
		// attach's `synced` re-arms counting.
		transport._seqCounting = false;
		// Consumed: the flag describes the connection that just ended. Leaving
		// it set would make a later park() misread the ended connection's
		// counted bytes as uncounted and drop a valid anchor.
		transport._bytesSinceAttach = false;
		setConnectionState(transport, "closed");
		// Per-connection outcome flags; consumed once per close.
		const connAttached = transport._connAttached;
		const hadRetryableError = transport._connHadRetryableError;
		transport._connAttached = false;
		transport._connHadRetryableError = false;
		// Deliberate/terminal closes (PTY exit, fatal error, cleanup) don't
		// reconnect — partysocket won't re-dial after close(). Synthetic
		// dial-error closes carry a string code and are logged via the error
		// handler; they still fall through to the failure counting below.
		if (transport._terminated || closeEvent.code === 1000) return;

		// Every connection that ends without ever attaching is one failed
		// attempt — attach-retryable cycles, silent >5s-held closes (host died
		// mid-attach, proxy idle-timeout), and failed dials alike. This is the
		// counter partysocket's minUptime reset can't erase. A non-retryable
		// failure mode drops the stored daemon reason so the diagnosis
		// classifies from the live probe instead.
		if (!connAttached) {
			recordFailedConnection(transport._attachRetry);
			if (!hadRetryableError) {
				clearAttachRetryableMessage(transport._attachRetry);
			}
		}

		// Log real server closes (numeric code) below the threshold; past it the
		// header diagnosis conveys the state, and a hidden window shouldn't spam.
		// Attach-retryable closes were already logged from the error frame.
		if (
			typeof closeEvent.code === "number" &&
			!hadRetryableError &&
			!isWindowHidden() &&
			effectiveFailureCount(
				transport._attachRetry,
				transport._socket?.retryCount ?? 0,
			) < DIAGNOSE_AFTER_ATTEMPTS
		) {
			pushLog(
				transport,
				"warn",
				`WebSocket closed while connected to ${formatWsEndpoint(transport.currentUrl)} (${formatCloseDetails(closeEvent)}). Reconnecting (attempt ${effectiveFailureCount(transport._attachRetry, transport._socket?.retryCount ?? 0)}/${DIAGNOSE_AFTER_ATTEMPTS})...`,
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
			effectiveFailureCount(
				transport._attachRetry,
				transport._socket?.retryCount ?? 0,
			) < DIAGNOSE_AFTER_ATTEMPTS
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
 * Park the transport while its pane is hidden: close the socket and stop the
 * liveness/reconnect machinery, keeping everything needed to resume — stream
 * position (seqAnchor), replay flags, title, logs, session-ended state.
 *
 * A parked pane must cost nothing. Before this, every parked terminal kept a
 * live socket that (a) received and parsed the full output stream of hidden
 * agents, and (b) on any endpoint failure re-dialed forever on capped backoff.
 * N parked panes retrying together feed Chromium's per-renderer WebSocket
 * handshake throttle, which then delays every NEW handshake by seconds — the
 * visible pane's reconnect (typing dead until re-attach) and create-on-attach
 * terminal opens (SUPER-2043).
 *
 * The next connect() dials fresh; a seq-aware host replays exactly the missed
 * bytes (or reanchors past the 2 MB ring), so parking loses nothing.
 */
export function park(transport: TerminalTransport) {
	// A pre-seq host (bytes delivered, `synced` never seen) cannot replay a
	// parked gap: it ignores `?seq=` and `replay=0` suppresses its legacy
	// FIFO replay, so closing this socket would silently drop everything
	// produced while parked. Keep the legacy always-connected behavior for
	// those hosts — a local host is always version-matched with the app, so
	// this only preserves output on version-skewed remote hosts. Also covers
	// a first-ever connection parked before its `synced` arrived.
	if (transport._hasReceivedBytes && !transport._seqEverSynced) return;
	teardownLiveness(transport);
	const socket = transport._socket;
	if (socket) {
		// Null before close() so the close listener's stale-socket guard drops
		// the event — a park must not count as a failed attempt or push a log.
		transport._socket = null;
		socket.close();
	}
	// The skipped close handler is also what consumes these per-connection
	// flags. Left latched from an attached session, a post-remount connection
	// that dies before attaching would read the stale `_connAttached` and skip
	// the failed-attempt accounting, delaying the outage diagnosis by a dial.
	transport._connAttached = false;
	transport._connHadRetryableError = false;
	// Mirror the close handler's anchor hygiene too: bytes without a `synced`
	// came from a pre-seq host (or landed before this attach's sync) and
	// advanced the xterm without advancing the anchor — a stale anchor kept
	// across the park would let a later exact catch-up re-deliver painted
	// bytes. Anchored-and-counted state survives untouched.
	if (transport._bytesSinceAttach && !transport._seqCounting) {
		transport.seqAnchor = null;
	}
	transport._seqCounting = false;
	transport._bytesSinceAttach = false;

	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = null;
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	if (transport.connectionState !== "disconnected") {
		setConnectionState(transport, "disconnected");
	}
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
	resetAttachRetryState(transport._attachRetry);
	setConnectionState(transport, "connecting");
	// reconnect() also resets partysocket's retryCount → fresh diagnosis budget.
	transport._socket.reconnect();
}

export function disconnect(transport: TerminalTransport) {
	teardownLiveness(transport);
	transport._disposeFocusListeners?.();
	transport._disposeFocusListeners = null;
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
	resetAttachRetryState(transport._attachRetry);
	setTerminalTitle(transport, undefined);
	setConnectionState(transport, "disconnected");
}

/**
 * The anchor worth persisting next to the buffer snapshot, or null when it
 * can't be trusted: a pre-seq host advanced the xterm without ever sending
 * `synced` (`_hasReceivedBytes` without `_seqEverSynced`), so a stale value
 * would make a future exact catch-up re-deliver bytes already painted. A
 * restored anchor with no bytes received since restore is still valid.
 */
export function getPersistableSeqAnchor(
	transport: TerminalTransport,
): { epoch: string; seq: number } | null {
	if (!transport.seqAnchor) return null;
	if (transport._seqEverSynced || !transport._hasReceivedBytes) {
		return { ...transport.seqAnchor };
	}
	return null;
}

function sendFocusState(transport: TerminalTransport) {
	const socket = transport._socket;
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	const textarea = transport._terminal?.textarea ?? null;
	const focused =
		textarea !== null &&
		document.hasFocus() &&
		document.activeElement === textarea;
	socket.send(JSON.stringify({ type: "focus", focused }));
}

function sendVisibleState(transport: TerminalTransport) {
	const socket = transport._socket;
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	socket.send(JSON.stringify({ type: "visible", visible: transport._visible }));
}

/**
 * Tell the host whether this pane is on screen. Only visible clients constrain
 * the PTY size, so parking a pane hands its width back to the other clients.
 */
export function setVisible(transport: TerminalTransport, visible: boolean) {
	if (transport._visible === visible) return;
	transport._visible = visible;
	if (transport.connectionState !== "open") return;
	sendVisibleState(transport);
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
	transport._disposeFocusListeners?.();
	transport._disposeFocusListeners = null;
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
	transport.sessionEnded = false;
	transport._onSessionEnded = null;
	transport.lastDiagnosis = null;
	resetAttachRetryState(transport._attachRetry);
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
