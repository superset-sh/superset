// Handoff snapshot — on-disk serialization of the SessionStore that the
// successor daemon reads on startup to rebuild its in-memory state.
//
// The kernel-side state (PTY master fds) flows through the stdio array of
// the spawned successor; this snapshot carries the daemon-side bookkeeping
// (session ids, metadata, replay buffers, the fd-index assigned to each
// session) so the successor can wire them up.
//
// On-disk format reuses the wire framing (see protocol/framing.ts):
//
//   [encodeFrame(handoffHeader)]
//   [encodeFrame(handoffSession_0, bufferBytes_0)]
//   [encodeFrame(handoffSession_1, bufferBytes_1)]
//   ...
//
// One byte-encoding format for the whole codebase — no JSON-with-base64
// just so disk-resident bytes can fit in a string. Buffer payloads ride
// the frame's binary tail exactly as they do on the wire.
//
// `version: 1` is a forward-compat hook only; the snapshot is a transient
// file written by the predecessor and consumed by the successor moments
// later, so we don't carry old versions forward.

import * as fs from "node:fs";
import { encodeFrame, FrameDecoder } from "../protocol/framing.ts";
import type { SessionMeta } from "../protocol/index.ts";
import type { Session } from "./SessionStore.ts";

export const SNAPSHOT_VERSION = 1;

interface HandoffHeaderMessage {
	type: "handoff-header";
	version: typeof SNAPSHOT_VERSION;
	writtenAt: number;
	sessionCount: number;
}

interface HandoffSessionMessage {
	type: "handoff-session";
	id: string;
	pid: number;
	meta: SessionMeta;
	/**
	 * Index in the successor's stdio array where this session's PTY master
	 * fd was placed. Successor uses this to map sessions → inherited fds.
	 */
	fdIndex: number;
}

export interface SerializedSession {
	id: string;
	pid: number;
	meta: SessionMeta;
	fdIndex: number;
	/** Live ring buffer bytes — empty Uint8Array when there's no replay. */
	buffer: Uint8Array;
}

export interface HandoffSnapshot {
	version: typeof SNAPSHOT_VERSION;
	writtenAt: number;
	sessions: SerializedSession[];
}

export interface SerializeOptions {
	sessions: Iterable<Session>;
	/**
	 * Maps session id → stdio fd index in the successor's argv.
	 * The predecessor decides this when building its spawn args.
	 */
	fdIndexBySessionId: Map<string, number>;
}

export function serializeSessions(opts: SerializeOptions): HandoffSnapshot {
	const out: SerializedSession[] = [];
	for (const s of opts.sessions) {
		// Exited sessions don't survive handoff — they have no live PTY fd
		// to inherit, and the renderer has already received their exit
		// event (see Server.onExit's delete-on-exit behavior).
		if (s.exited) continue;
		const fdIndex = opts.fdIndexBySessionId.get(s.id);
		if (fdIndex === undefined) {
			throw new Error(`no fdIndex assigned for session ${s.id}`);
		}
		out.push({
			id: s.id,
			pid: s.pty.pid,
			meta: s.pty.meta,
			fdIndex,
			buffer: Buffer.concat(s.buffer),
		});
	}
	return {
		version: SNAPSHOT_VERSION,
		writtenAt: Date.now(),
		sessions: out,
	};
}

/**
 * Atomic write — write to `<path>.tmp` then rename. Successor that reads
 * `<path>` always sees a complete file (rename is atomic on POSIX).
 */
export function writeSnapshot(path: string, snapshot: HandoffSnapshot): void {
	const tmp = `${path}.tmp`;
	const header: HandoffHeaderMessage = {
		type: "handoff-header",
		version: snapshot.version,
		writtenAt: snapshot.writtenAt,
		sessionCount: snapshot.sessions.length,
	};
	const parts: Buffer[] = [encodeFrame(header)];
	for (const s of snapshot.sessions) {
		const msg: HandoffSessionMessage = {
			type: "handoff-session",
			id: s.id,
			pid: s.pid,
			meta: s.meta,
			fdIndex: s.fdIndex,
		};
		parts.push(
			encodeFrame(msg, s.buffer.byteLength > 0 ? s.buffer : undefined),
		);
	}
	fs.writeFileSync(tmp, Buffer.concat(parts), { mode: 0o600 });
	fs.renameSync(tmp, path);
}

export function readSnapshot(path: string): HandoffSnapshot {
	const raw = fs.readFileSync(path);
	const dec = new FrameDecoder();
	dec.push(raw);
	const frames = dec.drain();
	if (frames.length === 0) {
		throw new Error(`malformed handoff snapshot at ${path}: no frames`);
	}

	const headerMsg = frames[0]?.message as Partial<HandoffHeaderMessage>;
	if (!headerMsg || headerMsg.type !== "handoff-header") {
		throw new Error(
			`malformed handoff snapshot at ${path}: missing header frame`,
		);
	}
	if (headerMsg.version !== SNAPSHOT_VERSION) {
		throw new Error(
			`unsupported snapshot version ${headerMsg.version} at ${path} (expected ${SNAPSHOT_VERSION})`,
		);
	}
	if (typeof headerMsg.writtenAt !== "number") {
		throw new Error(`malformed handoff snapshot at ${path}: bad writtenAt`);
	}
	if (
		typeof headerMsg.sessionCount !== "number" ||
		headerMsg.sessionCount !== frames.length - 1
	) {
		throw new Error(
			`malformed handoff snapshot at ${path}: header session count ${headerMsg.sessionCount} ≠ ${frames.length - 1} session frames`,
		);
	}

	const sessions: SerializedSession[] = [];
	for (let i = 1; i < frames.length; i++) {
		const frame = frames[i];
		if (!frame) continue;
		const m = frame.message as Partial<HandoffSessionMessage>;
		if (
			m.type !== "handoff-session" ||
			typeof m.id !== "string" ||
			typeof m.pid !== "number" ||
			typeof m.fdIndex !== "number" ||
			typeof m.meta !== "object" ||
			m.meta === null
		) {
			throw new Error(
				`malformed handoff snapshot at ${path}: bad session frame at index ${i}`,
			);
		}
		sessions.push({
			id: m.id,
			pid: m.pid,
			meta: m.meta as SessionMeta,
			fdIndex: m.fdIndex,
			buffer: frame.payload ?? new Uint8Array(0),
		});
	}

	return {
		version: headerMsg.version,
		writtenAt: headerMsg.writtenAt,
		sessions,
	};
}

export function clearSnapshot(path: string): void {
	try {
		fs.unlinkSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}
