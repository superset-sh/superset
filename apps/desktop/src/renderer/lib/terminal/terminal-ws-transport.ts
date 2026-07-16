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
	| {
			type: "attached";
			terminalId: string;
			replayKind?: "full" | "delta" | "none";
			replayId?: number;
			replayPrefixBytes?: number;
			replayDataBytes?: number;
			replayTruncated?: boolean;
	  }
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

	/** Internal: the reconnecting relay socket (partysocket). Created on first
	 * connect and replaced only when the base endpoint changes; it re-signs the
	 * URL and runs the relay preflight before every (re)dial. */
	_socket: RelaySocket | null;
	/**
	 * Monotonic identity for `_socket`. Endpoint changes replace the wrapper;
	 * async provider callbacks from an older wrapper must not mutate the new
	 * connection's state.
	 */
	_socketGeneration: number;
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
	 * The xterm already contains meaningful terminal output. This can come from
	 * a persisted snapshot or from live PTY bytes rendered before a host-service
	 * restart. A daemon `full` replay must reconcile against either baseline
	 * without erasing older xterm scrollback.
	 */
	_hasRenderedBaseline: boolean;
	/** Bounded raw PTY tail represented by the serialized xterm snapshot. */
	_replayCheckpoint: Uint8Array;
	/** Mirror checkpoint updates into the runtime's atomic persistence record. */
	_updateReplayCheckpoint: ((checkpoint: Uint8Array) => void) | null;
	/** Flush the atomic snapshot + checkpoint through Chromium's partition. */
	_flushReplayPersistence: (() => boolean | Promise<boolean>) | null;
	/** Internal: wall-clock-gap watchdog for laptop sleep/wake detection. */
	_livenessTimer: ReturnType<typeof setInterval> | null;
	/** Internal: Date.now() at the last watchdog tick. */
	_lastLivenessTick: number;
	/** Internal: bound resume handler shared by the online/focus/visibility
	 * listeners, so they can be removed on teardown. */
	_resumeListener: (() => void) | null;
	/** Internal: last geometry sent on the current WebSocket. */
	_lastResizeCols: number | null;
	_lastResizeRows: number | null;
}

export interface TerminalReplayPersistence {
	initialCheckpoint: Uint8Array;
	updateCheckpoint: (checkpoint: Uint8Array) => void;
	flush: () => boolean | Promise<boolean>;
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
const MAX_REPLAY_CHECKPOINT_BYTES = 64 * 1024;
const MIN_SAFE_REPLAY_MATCH_BYTES = 256;

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
		_socketGeneration: 0,
		_terminal: null,
		_onDataDisposable: null,
		_titleNotifyTimer: null,
		_writeCoalescer: null,
		_diagnosisLogged: false,
		_lastProbe: null,
		_localToken: null,
		_hasRenderedBaseline: false,
		_replayCheckpoint: new Uint8Array(),
		_updateReplayCheckpoint: null,
		_flushReplayPersistence: null,
		_terminated: false,
		_livenessTimer: null,
		_lastLivenessTick: 0,
		_resumeListener: null,
		_lastResizeCols: null,
		_lastResizeRows: null,
	};
}

export function setRenderedBaselineState(
	transport: TerminalTransport,
	hasRenderedBaseline: boolean,
) {
	transport._hasRenderedBaseline = hasRenderedBaseline;
}

function advanceReplayCheckpoint(
	transport: TerminalTransport,
	bytes: Uint8Array,
): Uint8Array {
	if (bytes.byteLength === 0) return transport._replayCheckpoint;
	const previous = transport._replayCheckpoint;
	const keep = Math.min(
		MAX_REPLAY_CHECKPOINT_BYTES,
		previous.byteLength + bytes.byteLength,
	);
	const next = new Uint8Array(keep);
	const bytesKeep = Math.min(bytes.byteLength, keep);
	const previousKeep = keep - bytesKeep;
	if (previousKeep > 0) {
		next.set(previous.subarray(previous.byteLength - previousKeep), 0);
	}
	if (bytesKeep > 0) {
		next.set(bytes.subarray(bytes.byteLength - bytesKeep), previousKeep);
	}
	transport._replayCheckpoint = next;
	return next;
}

/** Longest suffix(checkpoint) equal to prefix(replay), in linear time. */
export function findReplayOverlap(
	checkpoint: Uint8Array,
	replay: Uint8Array,
): number {
	if (checkpoint.byteLength === 0 || replay.byteLength === 0) return 0;
	const prefix = new Uint32Array(replay.byteLength);
	for (let i = 1, matched = 0; i < replay.byteLength; i += 1) {
		while (matched > 0 && replay[i] !== replay[matched]) {
			matched = prefix[matched - 1] ?? 0;
		}
		if (replay[i] === replay[matched]) matched += 1;
		prefix[i] = matched;
	}
	let matched = 0;
	for (const byte of checkpoint) {
		while (matched > 0 && byte !== replay[matched]) {
			matched = prefix[matched - 1] ?? 0;
		}
		if (byte === replay[matched]) matched += 1;
		if (matched === replay.byteLength) {
			matched = prefix[matched - 1] ?? 0;
		}
	}
	if (
		checkpoint.byteLength >= replay.byteLength &&
		checkpoint
			.subarray(checkpoint.byteLength - replay.byteLength)
			.every((byte, index) => byte === replay[index])
	) {
		return replay.byteLength;
	}
	return matched;
}

export interface ReplayBoundary {
	seenBytes: number;
	ambiguous: boolean;
	anchorFound: boolean;
}

/** Locate the earliest lossless checkpoint boundary inside a bounded replay. */
export function findReplayBoundary(
	checkpoint: Uint8Array,
	replay: Uint8Array,
): ReplayBoundary {
	if (checkpoint.byteLength === 0 || replay.byteLength === 0) {
		return { seenBytes: 0, ambiguous: false, anchorFound: false };
	}

	const overlap = findReplayOverlap(checkpoint, replay);
	const safeOverlap = overlap >= MIN_SAFE_REPLAY_MATCH_BYTES ? overlap : -1;
	const prefix = new Uint32Array(checkpoint.byteLength);
	for (let i = 1, matched = 0; i < checkpoint.byteLength; i += 1) {
		while (matched > 0 && checkpoint[i] !== checkpoint[matched]) {
			matched = prefix[matched - 1] ?? 0;
		}
		if (checkpoint[i] === checkpoint[matched]) matched += 1;
		prefix[i] = matched;
	}
	let matched = 0;
	let firstBoundary = -1;
	let occurrences = 0;
	for (let index = 0; index < replay.byteLength; index += 1) {
		const byte = replay[index];
		while (matched > 0 && byte !== checkpoint[matched]) {
			matched = prefix[matched - 1] ?? 0;
		}
		if (byte === checkpoint[matched]) matched += 1;
		if (matched === checkpoint.byteLength) {
			occurrences += 1;
			if (firstBoundary < 0) firstBoundary = index + 1;
			matched = prefix[matched - 1] ?? 0;
		}
	}
	if (firstBoundary >= 0) {
		const seenBytes =
			safeOverlap >= 0 ? Math.min(safeOverlap, firstBoundary) : firstBoundary;
		return {
			seenBytes,
			ambiguous:
				occurrences > 1 || (safeOverlap >= 0 && safeOverlap !== firstBoundary),
			anchorFound: true,
		};
	}

	if (safeOverlap >= 0) {
		return { seenBytes: safeOverlap, ambiguous: false, anchorFound: true };
	}
	return { seenBytes: 0, ambiguous: false, anchorFound: false };
}

function isUtf8Continuation(byte: number | undefined): boolean {
	return byte !== undefined && (byte & 0xc0) === 0x80;
}

function utf8SequenceLength(byte: number | undefined): number {
	if (byte === undefined || (byte & 0x80) === 0) return 1;
	if ((byte & 0xe0) === 0xc0) return 2;
	if ((byte & 0xf0) === 0xe0) return 3;
	if ((byte & 0xf8) === 0xf0) return 4;
	return 1;
}

/** Re-feed an overlapping partial UTF-8 codepoint after snapshot restore. */
function replayWriteStart(replay: Uint8Array, overlap: number): number {
	if (overlap === 0) return 0;
	let lead = overlap;
	if (overlap < replay.byteLength && isUtf8Continuation(replay[overlap])) {
		lead = overlap - 1;
		while (lead > 0 && isUtf8Continuation(replay[lead])) lead -= 1;
		return lead;
	}
	if (overlap === replay.byteLength) {
		lead = overlap - 1;
		while (lead > 0 && isUtf8Continuation(replay[lead])) lead -= 1;
		if (lead + utf8SequenceLength(replay[lead]) > overlap) return lead;
	}
	return overlap;
}

function combineBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
	if (first.byteLength === 0) return second;
	if (second.byteLength === 0) return first;
	const combined = new Uint8Array(first.byteLength + second.byteLength);
	combined.set(first, 0);
	combined.set(second, first.byteLength);
	return combined;
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

function buildTerminalSocketUrl(url: string, hasRenderedBaseline: boolean) {
	try {
		const parsed = new URL(url);
		parsed.searchParams.set("replayProtocol", "1");
		if (hasRenderedBaseline) {
			// Old hosts understand replay=0 and avoid duplicating an adopted ring.
			// Protocol-v1 hosts ignore that legacy hint and use replayKind/replayId.
			parsed.searchParams.set("replay", "0");
		} else {
			parsed.searchParams.delete("replay");
		}
		return parsed.toString();
	} catch {
		const separator = url.includes("?") ? "&" : "?";
		return `${url}${separator}replayProtocol=1${hasRenderedBaseline ? "&replay=0" : ""}`;
	}
}

export function connect(
	transport: TerminalTransport,
	terminal: XTerm,
	wsUrl: string,
	replayPersistence?: TerminalReplayPersistence,
) {
	const base = stripToken(wsUrl);
	if (replayPersistence) {
		const shouldInitializeCheckpoint =
			transport._updateReplayCheckpoint === null;
		if (shouldInitializeCheckpoint) {
			transport._replayCheckpoint = replayPersistence.initialCheckpoint;
		}
		transport._updateReplayCheckpoint = replayPersistence.updateCheckpoint;
		transport._flushReplayPersistence = replayPersistence.flush;
	}

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
	transport._lastProbe = null;
	// Recreate per connect so the coalescer always targets the current terminal;
	// dispose flushes anything the previous socket left pending.
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = createWriteCoalescer((data) => {
		const checkpoint = advanceReplayCheckpoint(transport, data);
		terminal.write(data, () => {
			transport._updateReplayCheckpoint?.(checkpoint);
		});
	});
	setupLiveness(transport);
	setConnectionState(transport, "connecting");

	// A URL-provider call may already have captured the previous endpoint and be
	// waiting on token refresh / relay preflight. Calling reconnect() on that
	// same wrapper does not guarantee a second provider call while the first is
	// pending, so the stale dial can still win. Treat an endpoint change as an
	// identity change: invalidate callbacks first, then close the old wrapper and
	// create a fresh one whose provider is bound to this generation.
	const previousSocket = transport._socket;
	const socketGeneration = transport._socketGeneration + 1;
	transport._socketGeneration = socketGeneration;
	transport._socket = null;
	previousSocket?.close();

	let socket: RelaySocket;
	const endpointBase = base;
	const endpointIsRelay = isRelayHostUrl(wsUrl);
	const isCurrentSocket = () =>
		transport._socketGeneration === socketGeneration &&
		transport._socket === socket;
	socket = createRelaySocket({
		name: "desktop-terminal",
		// This wrapper belongs to one endpoint generation. Token rotation still
		// reads live state on every retry; endpoint rotation creates a new wrapper.
		buildUrl: () =>
			buildTerminalSocketUrl(endpointBase, transport._hasRenderedBaseline),
		getToken: () =>
			endpointIsRelay ? ensureFreshJwt() : transport._localToken,
		isDialCurrent: isCurrentSocket,
		// 403 is a definitive access denial (fresh token), not transient —
		// createRelaySocket closes the socket; record why so we stop looking.
		onAccessDenied: () => {
			if (!isCurrentSocket()) return;
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
			if (!isCurrentSocket()) return;
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
	attachSocketListeners(transport, terminal, socket, socketGeneration);
}

function attachSocketListeners(
	transport: TerminalTransport,
	terminal: XTerm,
	socket: RelaySocket,
	socketGeneration: number,
): void {
	const isCurrentSocket = () =>
		transport._socketGeneration === socketGeneration &&
		transport._socket === socket;
	let connectionGeneration = 0;
	let pendingReplay: {
		replayKind: "full" | "delta" | "none";
		replayId?: number;
		connectionGeneration: number;
		prefixBytes: number;
		/** Null only for a rolling update from a pre-length-metadata host. */
		dataBytes: number | null;
		truncated: boolean;
		writeStarted: boolean;
	} | null = null;

	socket.addEventListener("open", () => {
		if (!isCurrentSocket()) return;
		connectionGeneration += 1;
		pendingReplay = null;
		// createRelaySocket reuses one wrapper across reconnects, but every open
		// represents a fresh underlying WebSocket that needs the exact geometry.
		transport._lastResizeCols = null;
		transport._lastResizeRows = null;
	});

	socket.addEventListener("message", (event) => {
		// Ignore events from a socket we've detached (teardown nulls _socket).
		if (!isCurrentSocket()) return;
		const data = (event as { data: unknown }).data;

		// Binary frame = PTY output bytes (data + replay share one channel).
		// `attached` describes the exact replay frame so mode/notice bytes stay out
		// of the raw PTY checkpoint and a bounded recovery tail can be reconciled.
		if (data instanceof ArrayBuffer) {
			const bytes = new Uint8Array(data);
			if (bytes.byteLength === 0) return;
			if (pendingReplay && !pendingReplay.writeStarted) {
				pendingReplay.writeStarted = true;
				const replayId = pendingReplay.replayId;
				const replayKind = pendingReplay.replayKind;
				const replayConnectionGeneration = pendingReplay.connectionGeneration;
				const expectedBytes =
					pendingReplay.dataBytes === null
						? null
						: pendingReplay.prefixBytes + pendingReplay.dataBytes;
				if (expectedBytes !== null && bytes.byteLength !== expectedBytes) {
					pushLog(
						transport,
						"warn",
						"Terminal replay frame metadata did not match its payload; keeping the existing history and skipping the replay ACK.",
					);
					pendingReplay = null;
					transport._writeCoalescer?.push(bytes);
					transport._hasRenderedBaseline = true;
					return;
				}
				transport._writeCoalescer?.flushSync();
				const prefix = bytes.subarray(0, pendingReplay.prefixBytes);
				const replay = bytes.subarray(pendingReplay.prefixBytes);
				const hadCheckpoint = transport._replayCheckpoint.byteLength > 0;
				const boundary =
					replayKind !== "none" && transport._hasRenderedBaseline
						? findReplayBoundary(transport._replayCheckpoint, replay)
						: { seenBytes: 0, ambiguous: false, anchorFound: false };
				const overlap = boundary.seenBytes;
				const writeStart = replayWriteStart(replay, overlap);
				const unseenReplay = replay.subarray(overlap);
				const replayBytes = combineBytes(prefix, replay.subarray(writeStart));
				const replayCheckpoint = advanceReplayCheckpoint(
					transport,
					unseenReplay,
				);
				if (boundary.ambiguous) {
					pushLog(
						transport,
						"warn",
						"Terminal replay matched the saved checkpoint more than once. The earliest boundary was used so no unseen output could be skipped.",
					);
				}
				const checkpointGap =
					replayKind === "full" &&
					transport._hasRenderedBaseline &&
					hadCheckpoint &&
					!boundary.anchorFound;
				if (pendingReplay.truncated || checkpointGap) {
					pushLog(
						transport,
						"warn",
						"Terminal recovery exceeded the reconnect window or no longer contained the saved checkpoint. Older rendered history was preserved; the newest bounded tail was appended.",
					);
				}
				transport._hasRenderedBaseline = true;
				terminal.write(replayBytes, () => {
					transport._updateReplayCheckpoint?.(replayCheckpoint);
					if (replayKind !== "full" || replayId === undefined) {
						pendingReplay = null;
						return;
					}
					void (async () => {
						if (
							!isCurrentSocket() ||
							socket.readyState !== WebSocket.OPEN ||
							connectionGeneration !== replayConnectionGeneration ||
							pendingReplay?.connectionGeneration !==
								replayConnectionGeneration ||
							pendingReplay.replayId !== replayId
						) {
							return;
						}
						let persisted = false;
						try {
							persisted =
								(await transport._flushReplayPersistence?.()) ?? false;
						} catch {
							return;
						}
						if (!persisted) return;
						if (
							!isCurrentSocket() ||
							socket.readyState !== WebSocket.OPEN ||
							connectionGeneration !== replayConnectionGeneration ||
							pendingReplay?.connectionGeneration !==
								replayConnectionGeneration ||
							pendingReplay.replayId !== replayId
						) {
							return;
						}
						try {
							socket.send(JSON.stringify({ type: "replay-ack", replayId }));
							pendingReplay = null;
						} catch {
							// The host retains this generation for a fresh reconciliation.
						}
					})();
				});
				return;
			}
			// Ordinary PTY bytes update the raw checkpoint only after xterm parses
			// the coalesced write. Replay ACK is a durability boundary, not flow control.
			transport._writeCoalescer?.push(bytes);
			transport._hasRenderedBaseline = true;
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
			// Missing replayKind means a pre-v1 host. The reconnect URL's replay=0
			// is the compatibility contract; never guess that an unlabelled frame is
			// a protocol delta/full replay.
			const replayKind = message.replayKind ?? "none";
			const hasLengthMetadata =
				Number.isSafeInteger(message.replayPrefixBytes) &&
				(message.replayPrefixBytes ?? -1) >= 0 &&
				Number.isSafeInteger(message.replayDataBytes) &&
				(message.replayDataBytes ?? -1) >= 0;
			const replayPrefixBytes = hasLengthMetadata
				? (message.replayPrefixBytes as number)
				: 0;
			const replayDataBytes = hasLengthMetadata
				? (message.replayDataBytes as number)
				: null;
			const legacyFullReplay =
				replayKind === "full" &&
				Number.isSafeInteger(message.replayId) &&
				message.replayPrefixBytes === undefined &&
				message.replayDataBytes === undefined;
			pendingReplay =
				(hasLengthMetadata &&
					replayDataBytes !== null &&
					replayPrefixBytes + replayDataBytes > 0) ||
				legacyFullReplay
					? {
							replayKind,
							replayId:
								replayKind === "full" && Number.isSafeInteger(message.replayId)
									? (message.replayId as number)
									: undefined,
							connectionGeneration,
							prefixBytes: replayPrefixBytes,
							dataBytes: legacyFullReplay ? null : replayDataBytes,
							truncated: message.replayTruncated === true,
							writeStarted: false,
						}
					: null;
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
		if (!isCurrentSocket()) return;
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
		if (!isCurrentSocket()) return;
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
		if (!isCurrentSocket()) return;
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
	const socket = transport._socket;
	transport._socket = null;
	transport._socketGeneration += 1;
	socket?.close();
	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = null;
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	transport._updateReplayCheckpoint = null;
	transport._flushReplayPersistence = null;
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
	if (
		transport._lastResizeCols === cols &&
		transport._lastResizeRows === rows
	) {
		return;
	}
	const socket = transport._socket;
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	if (transport.connectionState !== "open") return;
	socket.send(JSON.stringify({ type: "resize", cols, rows }));
	transport._lastResizeCols = cols;
	transport._lastResizeRows = rows;
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

export async function disposeTransport(
	transport: TerminalTransport,
	options: {
		waitForParserIdle?: () => Promise<boolean>;
		shouldFinalize?: () => boolean;
	} = {},
): Promise<boolean> {
	teardownLiveness(transport);
	const socket = transport._socket;
	transport._socket = null;
	transport._socketGeneration += 1;
	socket?.close();
	transport._onDataDisposable?.dispose();
	transport._onDataDisposable = null;
	transport._writeCoalescer?.dispose();
	transport._writeCoalescer = null;
	// The coalescer's final flush only enqueues xterm.write(). Keep persistence
	// callbacks alive until that parser callback (and any earlier direct replay
	// write) has fully unwound, otherwise release can serialize a stale buffer
	// and drop the matching raw checkpoint update.
	if (options.waitForParserIdle) {
		if (!(await options.waitForParserIdle())) return false;
	}
	// A rapid remount may have reused this transport while the old parser drain
	// was pending. In that case the new connection owns every field below.
	if (options.shouldFinalize && !options.shouldFinalize()) return false;
	transport._updateReplayCheckpoint = null;
	transport._flushReplayPersistence = null;
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
	return true;
}
