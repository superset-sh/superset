// Handoff snapshot — on-disk serialization of the SessionStore that the
// successor daemon reads on startup to rebuild its in-memory state.
//
// The kernel-side state (PTY master fds) flows through the stdio array of
// the spawned successor; this snapshot carries the daemon-side bookkeeping
// (session ids, metadata, replay buffers, the fd-index assigned to each
// session) so the successor can wire them up.
//
// On-disk shape is intentionally tiny — we don't need to be backwards
// compatible across daemon versions; the snapshot is a transient file
// written by the predecessor and consumed by the successor moments later.
// `version: 1` is a forward-compat hook only.

import * as fs from "node:fs";
import type { SessionMeta } from "../protocol/index.ts";
import type { Session } from "./SessionStore.ts";

export const SNAPSHOT_VERSION = 1;

export interface SerializedSession {
	id: string;
	pid: number;
	meta: SessionMeta;
	/**
	 * Index in the successor's stdio array where this session's PTY master
	 * fd was placed. Successor uses this to map sessions → inherited fds.
	 */
	fdIndex: number;
	/** Base64-encoded ring buffer for replay-on-attach. */
	buffer: string;
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
			buffer: Buffer.concat(s.buffer).toString("base64"),
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
	fs.writeFileSync(tmp, JSON.stringify(snapshot), { mode: 0o600 });
	fs.renameSync(tmp, path);
}

export function readSnapshot(path: string): HandoffSnapshot {
	const raw = fs.readFileSync(path, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	if (!isHandoffSnapshot(parsed)) {
		throw new Error(`malformed handoff snapshot at ${path}`);
	}
	if (parsed.version !== SNAPSHOT_VERSION) {
		throw new Error(
			`unsupported snapshot version ${parsed.version} at ${path} (expected ${SNAPSHOT_VERSION})`,
		);
	}
	return parsed;
}

export function clearSnapshot(path: string): void {
	try {
		fs.unlinkSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

function isHandoffSnapshot(v: unknown): v is HandoffSnapshot {
	if (typeof v !== "object" || v === null) return false;
	const s = v as Partial<HandoffSnapshot>;
	if (typeof s.version !== "number") return false;
	if (typeof s.writtenAt !== "number") return false;
	if (!Array.isArray(s.sessions)) return false;
	for (const session of s.sessions) {
		if (
			typeof session !== "object" ||
			session === null ||
			typeof session.id !== "string" ||
			typeof session.pid !== "number" ||
			typeof session.fdIndex !== "number" ||
			typeof session.buffer !== "string" ||
			typeof session.meta !== "object" ||
			session.meta === null
		) {
			return false;
		}
	}
	return true;
}
