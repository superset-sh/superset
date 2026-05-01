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
 */
export interface Conn {
	subscriptions: Set<string>;
	send(message: ServerMessage): void;
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
	let session: Session;
	const spawnFn = ctx.spawnPty ?? defaultSpawn;
	try {
		const pty = spawnFn({ meta: msg.meta });
		session = ctx.store.add(msg.id, pty);
	} catch (err) {
		return errorFor(msg.id, (err as Error).message, "ESPAWN");
	}
	ctx.wireSession(session);
	const reply: OpenOkMessage = {
		type: "open-ok",
		id: msg.id,
		pid: session.pty.pid,
	};
	return reply;
}

export function handleInput(
	ctx: HandlerCtx,
	msg: InputMessage,
): ServerMessage | undefined {
	const session = ctx.store.get(msg.id);
	if (!session) return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
	if (session.exited)
		return errorFor(msg.id, `session exited: ${msg.id}`, "EEXITED");
	try {
		session.pty.write(Buffer.from(msg.data, "base64"));
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
	try {
		// SIGHUP is the right signal for "your terminal is going away" —
		// what the kernel sends when a TTY actually closes. Interactive
		// shells (especially `zsh -l`) trap SIGTERM and stay alive, so
		// using SIGTERM as the default leaks PTY processes on every
		// pane close. Callers can still pass an explicit signal.
		session.pty.kill(msg.signal ?? "SIGHUP");
	} catch (err) {
		return errorFor(msg.id, (err as Error).message, "EKILL");
	}
	return { type: "closed", id: msg.id };
}

export function handleList(ctx: HandlerCtx): ListReplyMessage {
	return { type: "list-reply", sessions: ctx.store.list() };
}

/**
 * Subscribe the connection to a session. If `replay` is true, immediately
 * send an `output` frame containing the buffered bytes before live streaming
 * begins. Live streaming is the Server's job once `subscriptions` includes
 * this session id.
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
			const out: OutputMessage = {
				type: "output",
				id: msg.id,
				data: snap.toString("base64"),
			};
			conn.send(out);
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
