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

/**
 * Host → relay keepalive, carrying the host's current JWT so long-lived
 * control channels don't strand the relay with an expired token (JWTs rotate
 * roughly hourly; the relay needs a valid one to write presence at any time).
 */
export interface ControlPing {
	type: "ping";
	token?: string;
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
