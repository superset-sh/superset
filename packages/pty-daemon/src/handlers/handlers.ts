import {
	spawn as defaultSpawn,
	type Pty,
	type SpawnOptions,
} from "../Pty/index.ts";
import type {
	CloseMessage,
	InputMessage,
	ListReplyMessage,
	OpenMessage,
	OpenOkMessage,
	OutputMessage,
	ResizeMessage,
	ServerMessage,
	SubscribeMessage,
	UnsubscribeMessage,
} from "../protocol/index.ts";
import type { Session, SessionStore } from "../SessionStore/index.ts";

/**
 * Per-connection state owned by the Server. Handlers receive a Conn ref to
 * read/write subscription membership and to send messages.
 *
 * `send` accepts an optional `payload` — the binary tail of the wire frame.
 * Used for output/replay messages so PTY bytes don't have to detour through
 * base64 inside the JSON header. (See ../protocol/framing.ts.)
 */
export interface Conn {
	subscriptions: Set<string>;
	send(message: ServerMessage, payload?: Uint8Array): void;
}

/**
 * Wire a freshly-created session's PTY events into the broadcast pipeline.
 * Called once at session-open time. The Server owns the broadcast set.
 */
export type SessionWirer = (session: Session) => void;

export interface HandlerCtx {
	store: SessionStore;
	wireSession: SessionWirer;
	/** Pluggable spawn for testability; defaults to real node-pty in production. */
	spawnPty?: (opts: SpawnOptions) => Pty;
}

export function handleOpen(ctx: HandlerCtx, msg: OpenMessage): ServerMessage {
	const existing = ctx.store.get(msg.id);
	if (existing) {
		// If the existing entry is for an already-exited shell, treat the open
		// as recycling the id: drop the dead entry and let the spawn proceed.
		// Live shells still reject with EEXIST so host-service drives the
		// adoption-via-list path.
		if (existing.exited) {
			ctx.store.delete(msg.id);
		} else {
			return errorFor(msg.id, `session already exists: ${msg.id}`, "EEXIST");
		}
	}
	let session: Session | null = null;
	let pty: Pty | null = null;
	const spawnFn = ctx.spawnPty ?? defaultSpawn;
	try {
		pty = spawnFn({ meta: msg.meta });
		session = ctx.store.add(msg.id, pty);
		ctx.wireSession(session);
	} catch (err) {
		if (session) ctx.store.delete(session.id);
		if (pty) {
			// A factory can fail after the native fork, or later open setup can
			// fail after the factory returns. Do not strand either the process
			// tree or the master descriptor in those partial-open paths.
			try {
				pty.kill("SIGKILL");
			} catch {
				// Preserve the original open error.
			}
			try {
				pty.dispose();
			} catch {
				// Preserve the original open error.
			}
		}
		return errorFor(msg.id, (err as Error).message, "ESPAWN");
	}
	const reply: OpenOkMessage = {
		type: "open-ok",
		id: msg.id,
		pid: session.pty.pid,
	};
	return reply;
}

/**
 * `payload` is the input bytes the client wants written to the PTY. Pulled
 * from the frame's binary tail by the Server before dispatching.
 */
export function handleInput(
	ctx: HandlerCtx,
	msg: InputMessage,
	payload: Uint8Array | null,
): ServerMessage | undefined {
	const session = ctx.store.get(msg.id);
	if (!session) return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
	if (session.exited)
		return errorFor(msg.id, `session exited: ${msg.id}`, "EEXITED");
	if (!payload || payload.byteLength === 0) {
		// Empty input is a no-op; surfacing an error would force callers
		// to special-case zero-length writes for no real benefit.
		return undefined;
	}
	try {
		session.pty.write(Buffer.from(payload));
	} catch (err) {
		return errorFor(msg.id, (err as Error).message, "EWRITE");
	}
	return undefined;
}

export function handleResize(
	ctx: HandlerCtx,
	msg: ResizeMessage,
): ServerMessage | undefined {
	const session = ctx.store.get(msg.id);
	if (!session) return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
	try {
		session.pty.resize(msg.cols, msg.rows);
	} catch (err) {
		return errorFor(msg.id, (err as Error).message, "ERESIZE");
	}
	return undefined;
}

export function handleClose(ctx: HandlerCtx, msg: CloseMessage): ServerMessage {
	const session = ctx.store.get(msg.id);
	if (!session) return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
	let killError: unknown = null;
	try {
		// SIGHUP is the right signal for "your terminal is going away" —
		// what the kernel sends when a TTY actually closes. Interactive
		// shells (especially `zsh -l`) trap SIGTERM and stay alive, so
		// using SIGTERM as the default leaks PTY processes on every
		// pane close. Callers can still pass an explicit signal.
		session.pty.kill(msg.signal ?? "SIGHUP");
	} catch (err) {
		killError = err;
	}
	try {
		// kill() preserves TreeKiller's process-tree semantics; dispose() then
		// releases the daemon's master fd immediately. Both are idempotent and
		// the kill escalation intentionally continues after descriptor close.
		session.pty.dispose();
	} catch {
		// A close request is still acknowledged once signaling succeeded. The
		// concrete adapters make disposal best-effort and non-throwing.
	}
	// The descriptor is no longer eligible for fd handoff even if process-exit
	// notification arrives later (notably the adopted-PTY liveness poll).
	session.exited = true;
	if (killError) return errorFor(msg.id, (killError as Error).message, "EKILL");
	return { type: "closed", id: msg.id };
}

export function handleList(ctx: HandlerCtx): ListReplyMessage {
	return { type: "list-reply", sessions: ctx.store.list() };
}

/**
 * Subscribe the connection to a session. If `replay` is true, immediately
 * send an `output` frame whose binary tail is the buffered bytes — before
 * live streaming begins. Live streaming is the Server's job once
 * `subscriptions` includes this session id.
 */
export function handleSubscribe(
	ctx: HandlerCtx,
	conn: Conn,
	msg: SubscribeMessage,
): void {
	const session = ctx.store.get(msg.id);
	if (!session) {
		conn.send(errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT"));
		return;
	}
	conn.subscriptions.add(msg.id);
	if (msg.replay) {
		const snap = ctx.store.snapshotBuffer(session);
		if (snap.byteLength > 0) {
			const out: OutputMessage = { type: "output", id: msg.id };
			conn.send(out, snap);
		}
	}
}

export function handleUnsubscribe(conn: Conn, msg: UnsubscribeMessage): void {
	conn.subscriptions.delete(msg.id);
}

function errorFor(
	id: string | undefined,
	message: string,
	code?: string,
): ServerMessage {
	return { type: "error", id, message, code };
}
