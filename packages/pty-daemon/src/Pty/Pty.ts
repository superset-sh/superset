import * as nodePty from "node-pty";
import type { SessionMeta } from "../protocol/index.ts";

export type PtyOnData = (data: Buffer) => void;
export type PtyOnExit = (info: {
	code: number | null;
	signal: number | null;
}) => void;

export interface Pty {
	readonly pid: number;
	readonly meta: SessionMeta;
	write(data: Buffer): void;
	resize(cols: number, rows: number): void;
	kill(signal?: NodeJS.Signals): void;
	onData(cb: PtyOnData): void;
	onExit(cb: PtyOnExit): void;
	/**
	 * The kernel master fd backing this PTY. Required for daemon-upgrade
	 * fd-handoff (Phase 2): the successor daemon process inherits this fd
	 * via stdio so the slave-side shell stays alive across the binary swap.
	 *
	 * Reaches into node-pty's private `_fd` property — see the version pin
	 * in package.json and the spawn-time assert below.
	 */
	getMasterFd(): number;
}

export interface SpawnOptions {
	meta: SessionMeta;
}

class NodePtyAdapter implements Pty {
	readonly pid: number;
	meta: SessionMeta;
	private term: nodePty.IPty;

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
	}

	getMasterFd(): number {
		// node-pty 1.1.x exposes the master fd as the private property `_fd`.
		// Pinned to "1.1.0" in package.json so a future bump can't break this
		// silently — assert here so a missing/changed field surfaces at the
		// first spawn, not when the user clicks "Update" months later.
		const fd = (this.term as unknown as { _fd?: unknown })._fd;
		if (typeof fd !== "number" || !Number.isInteger(fd) || fd < 0) {
			throw new Error(
				`node-pty master fd unavailable (got ${typeof fd}: ${fd}). ` +
					`Phase 2 fd-handoff depends on node-pty's private _fd property — ` +
					`pin node-pty to 1.1.x or update Pty.ts to match the new shape.`,
			);
		}
		return fd;
	}

	write(data: Buffer): void {
		// node-pty's write accepts strings or buffers; pass buffer to keep bytes intact.
		this.term.write(data as unknown as string);
	}

	resize(cols: number, rows: number): void {
		validateDims(cols, rows);
		this.term.resize(cols, rows);
		this.meta = { ...this.meta, cols, rows };
	}

	kill(signal?: NodeJS.Signals): void {
		this.term.kill(signal);
	}

	onData(cb: PtyOnData): void {
		this.term.onData((d) => {
			cb(typeof d === "string" ? Buffer.from(d, "utf8") : d);
		});
	}

	onExit(cb: PtyOnExit): void {
		this.term.onExit(({ exitCode, signal }) => {
			cb({ code: exitCode ?? null, signal: signal ?? null });
		});
	}
}

function validateDims(cols: number, rows: number): void {
	if (!Number.isInteger(cols) || cols <= 0) {
		throw new Error(`invalid cols: ${cols}`);
	}
	if (!Number.isInteger(rows) || rows <= 0) {
		throw new Error(`invalid rows: ${rows}`);
	}
}

export function spawn({ meta }: SpawnOptions): Pty {
	validateDims(meta.cols, meta.rows);
	const term = nodePty.spawn(meta.shell, meta.argv, {
		name: "xterm-256color",
		cols: meta.cols,
		rows: meta.rows,
		cwd: meta.cwd,
		env: meta.env,
		// node-pty's encoding defaults to utf8; we want raw bytes for fidelity.
		encoding: null,
	});
	const adapter = new NodePtyAdapter(term, meta);
	// Validate the private-fd dependency at spawn time, not handoff time.
	adapter.getMasterFd();
	return adapter;
}
