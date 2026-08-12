// Tunnel v2: one small JSON control channel per host + one raw WebSocket per
// proxied stream ("dial-back"). The relay asks the host to dial a fresh socket
// for each stream via a one-time ticket; after pairing, the relay splices
// bytes verbatim — no envelopes, no base64, no per-frame parsing.

/** Relay → host, on the control channel. The only control message. */
export interface StreamDial {
	type: "stream:dial";
	ticket: string;
	kind: "ws" | "http";
	/** Host-local path, e.g. "/terminal/<id>" or "/events". */
	path: string;
	/** Raw query string without leading "?", if any. */
	query?: string;
}

/** Host → relay keepalive; the relay stamps liveness and answers with a pong. */
export interface ControlPing {
	type: "ping";
}

// ── Close codes ─────────────────────────────────────────────────────
// Application close codes (4400-4499) with fixed recovery semantics, so
// every leg logs the same name and no client infers behavior from reason
// strings. Anything else is a transport-level close.
export const RELAY_CLOSE = {
	/** Malformed upgrade (missing hostId/ticket, unknown endpoint): fix the caller. */
	badRequest: 4400,
	/** JWT missing, invalid, or expired: mint a fresh token, then reconnect. */
	authExpired: 4401,
	/** Access check denied this identity: retry slowly, likely a config problem. */
	forbidden: 4403,
	/** Dial ticket unknown, expired, or already consumed: abandon this stream. */
	unknownTicket: 4404,
	/** Host sent no keepalive inside the stale window: reconnect immediately. */
	staleHost: 4408,
	/** A newer socket for the same host registered: yield, do not reconnect over it. */
	replaced: 4409,
	/** The host's control channel went away: this stream is dead, re-dial later. */
	tunnelGone: 4410,
} as const;

const RELAY_CLOSE_DESCRIPTIONS: Record<number, string> = {
	[RELAY_CLOSE.badRequest]: "bad-request: malformed upgrade, fix the caller",
	[RELAY_CLOSE.authExpired]: "auth-expired: mint a fresh token and reconnect",
	[RELAY_CLOSE.forbidden]: "forbidden: access denied, retry slowly",
	[RELAY_CLOSE.unknownTicket]:
		"unknown-ticket: stream credential gone, abandon",
	[RELAY_CLOSE.staleHost]: "stale-host: no keepalive, reconnect now",
	[RELAY_CLOSE.replaced]: "replaced: a newer host socket took over",
	[RELAY_CLOSE.tunnelGone]: "tunnel-gone: host control channel disconnected",
};

export function describeRelayClose(code: number): string | null {
	return RELAY_CLOSE_DESCRIPTIONS[code] ?? null;
}

export interface ControlPong {
	type: "pong";
}

// ── HTTP-over-dial frames ───────────────────────────────────────────
// A kind:"http" dial carries exactly one exchange, for callers that cannot
// hold a WebSocket (serverless SDK/MCP/API clients): relay sends a request
// header frame, the body as binary frames, then an end frame; the host
// replies symmetrically. Text frames are JSON; binary frames are raw bytes.

export interface HttpRequestHeader {
	type: "http:request";
	method: string;
	/** Path plus query string, ready to append to the local origin. */
	path: string;
	headers: Record<string, string>;
}

export interface HttpResponseHeader {
	type: "http:response";
	status: number;
	headers: Record<string, string>;
}

export interface HttpEnd {
	type: "http:end";
}

export type HttpDialFrame = HttpRequestHeader | HttpResponseHeader | HttpEnd;

/** How long the host has to dial back before the relay abandons the stream. */
export const DIAL_TIMEOUT_MS = 10_000;
