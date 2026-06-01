// Outbound WebSocket back-pressure for terminal output.
//
// PTY output flows daemon → host-service → renderer-WS at potentially
// hundreds of KB/s under active TUI use. If a renderer falls behind
// draining its WebSocket, every `ws.send()` from broadcastBytes pushes
// bytes onto the underlying `ws` library's outbound queue. That queue
// lives in the host-service V8 heap; without a cap, it grows until V8
// aborts with "Ineffective mark-compacts near heap limit" — what we
// saw in superset-sh/superset#4868.
//
// Strategy: per-socket cap on bufferedAmount. When a socket exceeds the
// cap we close it with 1013 (Try Again Later) and let the renderer's
// existing reconnect loop pull fresh state from the daemon's ring
// buffer + the mode preamble. Dropping bytes mid-stream would corrupt
// xterm's parser state, so a clean reconnect is the only safe escape.

/**
 * Per-socket bufferedAmount cap. Past this we close the socket. Sized so
 * healthy bursts on a local loopback (xterm drains tens of KB at a time)
 * never trip it, but a fully stuck consumer can't grow the V8 heap to its
 * default ~4 GB OOM limit before eviction kicks in.
 */
export const MAX_SOCKET_BACKPRESSURE_BYTES = 4 * 1024 * 1024;

/** WebSocket close code for back-pressure eviction. RFC 6455: 1013 = Try Again Later. */
export const BACKPRESSURE_CLOSE_CODE = 1013;

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

export interface BackpressureSocket {
	readyState: number;
	send: (data: string | Uint8Array<ArrayBuffer>) => void;
	close: (code?: number, reason?: string) => void;
	/**
	 * The underlying `ws` WebSocket (hono's WSContext exposes it as `raw`).
	 * Only `bufferedAmount` is read here — everything else stays opaque so
	 * tests can supply a minimal stub.
	 */
	raw?: { bufferedAmount?: number } | undefined;
}

export interface BackpressureSocketSet {
	sockets: Set<BackpressureSocket>;
}

export function socketBufferedBytes(socket: BackpressureSocket): number {
	return socket.raw?.bufferedAmount ?? 0;
}

export function isSocketBackpressured(
	socket: BackpressureSocket,
	threshold: number = MAX_SOCKET_BACKPRESSURE_BYTES,
): boolean {
	return socketBufferedBytes(socket) > threshold;
}

export interface BroadcastResult {
	/** Number of sockets the payload was sent to. */
	sent: number;
	/** Number of sockets closed for exceeding the back-pressure threshold. */
	evicted: number;
}

/**
 * Broadcast `payload` to every OPEN socket in `set`. Sockets in CLOSING/CLOSED
 * are pruned. Sockets whose bufferedAmount exceeds `threshold` are closed and
 * pruned — the caller's reconnect path is expected to re-establish them.
 */
export function broadcastWithBackpressure(
	set: BackpressureSocketSet,
	payload: string | Uint8Array<ArrayBuffer>,
	threshold: number = MAX_SOCKET_BACKPRESSURE_BYTES,
): BroadcastResult {
	let sent = 0;
	let evicted = 0;
	for (const socket of set.sockets) {
		if (socket.readyState !== SOCKET_OPEN) {
			if (
				socket.readyState === SOCKET_CLOSING ||
				socket.readyState === SOCKET_CLOSED
			) {
				set.sockets.delete(socket);
			}
			continue;
		}
		if (isSocketBackpressured(socket, threshold)) {
			try {
				socket.close(BACKPRESSURE_CLOSE_CODE, "terminal back-pressure");
			} catch {
				// best-effort
			}
			set.sockets.delete(socket);
			evicted += 1;
			continue;
		}
		socket.send(payload);
		sent += 1;
	}
	return { sent, evicted };
}
