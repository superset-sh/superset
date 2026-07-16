import {
	spawn as defaultSpawn,
	type Pty,
	type SpawnOptions,
} from "../Pty/index.ts";
import type {
	CloseMessage,
	InputAckMessage,
	InputMessage,
	ListReplyMessage,
	OpenMessage,
	OpenOkMessage,
	OutputMessage,
	ResizeMessage,
	ServerMessage,
	SubscribedMessage,
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
	if (!session)
		return errorFor(
			msg.id,
			`unknown session: ${msg.id}`,
			"ENOENT",
			msg.sequence,
		);
	if (session.exited)
		return errorFor(
			msg.id,
			`session exited: ${msg.id}`,
			"EEXITED",
			msg.sequence,
		);
	if (!payload || payload.byteLength === 0) {
		// Empty input is a no-op; surfacing an error would force callers
		// to special-case zero-length writes for no real benefit.
		return inputAckFor(msg);
	}
	try {
		session.pty.write(Buffer.from(payload));
	} catch (err) {
		return errorFor(msg.id, (err as Error).message, "EWRITE", msg.sequence);
	}
	return inputAckFor(msg);
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

export async function handleClose(
	ctx: HandlerCtx,
	msg: CloseMessage,
): Promise<ServerMessage> {
	const session = ctx.store.get(msg.id);
	if (!session) return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
	if (
		msg.expectedPid !== undefined &&
		(!Number.isSafeInteger(msg.expectedPid) ||
			msg.expectedPid <= 0 ||
			session.pty.pid !== msg.expectedPid)
	) {
		return errorFor(
			msg.id,
			`session ${msg.id} no longer belongs to pid ${msg.expectedPid}`,
			"ESTALE",
		);
	}
	try {
		// SIGHUP is the right signal for "your terminal is going away" —
		// what the kernel sends when a TTY actually closes. Interactive
		// shells (especially `zsh -l`) trap SIGTERM and stay alive, so
		// using SIGTERM as the default leaks PTY processes on every
		// pane close. Callers can still pass an explicit signal.
		await session.pty.kill(msg.signal ?? "SIGHUP");
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
	let replayBytes = 0;
	if (msg.replay) {
		const snap = ctx.store.snapshotBuffer(session);
		replayBytes = snap.byteLength;
		if (snap.byteLength > 0) {
			const out: OutputMessage = { type: "output", id: msg.id };
			conn.send(out, snap);
		}
	}
	const subscribed: SubscribedMessage = {
		type: "subscribed",
		id: msg.id,
		replayBytes,
		replayStartBytes: session.outputBytes - replayBytes,
		replayEndBytes: session.outputBytes,
	};
	conn.send(subscribed);
}

export function handleUnsubscribe(conn: Conn, msg: UnsubscribeMessage): void {
	conn.subscriptions.delete(msg.id);
}

function errorFor(
	id: string | undefined,
	message: string,
	code?: string,
	inputSequence?: number,
): ServerMessage {
	const error: ServerMessage = { type: "error", id, message, code };
	if (inputSequence !== undefined && error.type === "error") {
		error.inputSequence = inputSequence;
		error.inputOutcome = "not-enqueued";
	}
	return error;
}

function inputAckFor(msg: InputMessage): InputAckMessage | undefined {
	if (msg.sequence === undefined) return undefined;
	return { type: "input-ack", id: msg.id, sequence: msg.sequence };
}
