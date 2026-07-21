import type { Pty } from "../Pty/index.ts";
import type { SessionInfo } from "../protocol/index.ts";

const DEFAULT_BUFFER_BYTES = 64 * 1024;

export interface Session {
	id: string;
	pty: Pty;
	/** ring buffer for replay-on-attach; in-memory only, never persisted. */
	buffer: Buffer[];
	bufferBytes: number;
	bufferCap: number;
	exited: boolean;
	exitCode: number | null;
	exitSignal: number | null;
}

export interface SessionStoreOptions {
	bufferCap?: number;
}

/**
 * In-memory map of active sessions. Daemon-local state; nothing is persisted.
 *
 * Replay buffer is a circular FIFO of byte chunks per session, capped by
 * total byte size. When new output exceeds the cap, oldest chunks are
 * dropped (head). The cap is small (~64 KB) — enough to redraw a typical
 * shell screen on attach. Larger scrollback is the renderer's xterm.js
 * responsibility.
 */
export class SessionStore {
	private readonly sessions = new Map<string, Session>();
	private readonly bufferCap: number;

	constructor(opts: SessionStoreOptions = {}) {
		this.bufferCap = opts.bufferCap ?? DEFAULT_BUFFER_BYTES;
	}

	add(id: string, pty: Pty): Session {
		if (this.sessions.has(id)) {
			throw new Error(`session already exists: ${id}`);
		}
		const session: Session = {
			id,
			pty,
			buffer: [],
			bufferBytes: 0,
			bufferCap: this.bufferCap,
			exited: false,
			exitCode: null,
			exitSignal: null,
		};
		this.sessions.set(id, session);
		return session;
	}

	get(id: string): Session | undefined {
		return this.sessions.get(id);
	}

	delete(id: string): boolean {
		return this.sessions.delete(id);
	}

	list(): SessionInfo[] {
		const out: SessionInfo[] = [];
		for (const s of this.sessions.values()) {
			out.push({
				id: s.id,
				pid: s.pty.pid,
				cols: s.pty.meta.cols,
				rows: s.pty.meta.rows,
				alive: !s.exited,
			});
		}
		return out;
	}

	all(): IterableIterator<Session> {
		return this.sessions.values();
	}

	size(): number {
		return this.sessions.size;
	}

	/** Append output to a session's ring buffer; evict oldest chunks past the cap. */
	appendOutput(session: Session, chunk: Buffer): void {
		session.buffer.push(chunk);
		session.bufferBytes += chunk.byteLength;
		while (
			session.bufferBytes > session.bufferCap &&
			session.buffer.length > 0
		) {
			const head = session.buffer.shift();
			if (head) session.bufferBytes -= head.byteLength;
		}
	}

	/** Snapshot the buffered bytes for replay; doesn't clear the buffer. */
	snapshotBuffer(session: Session): Buffer {
		return Buffer.concat(session.buffer);
	}
}
