import type { ProcessTableEntry } from "./scanner.ts";
import { readTerminalIdsFromEnv } from "./terminal-env.ts";

export type TerminalEnvReader = (
	pids: number[],
	signal?: AbortSignal,
) => Promise<Map<number, string | null>>;

interface CacheEntry {
	ppid: number;
	terminalId: string | null;
}

/** Bound the ancestor walk; a real process chain is never this deep. */
const MAX_ANCESTOR_DEPTH = 64;

/**
 * Attributes processes that live outside every session's process tree to the
 * terminal whose environment they inherited.
 *
 * Agents routinely start dev servers detached: Claude Code's background Bash
 * and Codex's background shells spawn with a fresh session and no controlling
 * TTY, and once the wrapper shell exits the server is reparented to PID 1.
 * The ppid walk from the terminal's shell can't see it, but every descendant
 * still carries SUPERSET_TERMINAL_ID.
 *
 * Environment is read once per pid and cached — a process's environment is
 * fixed at exec — and re-read only when the pid leaves the table or changes
 * parent (reparenting, or pid reuse). A pid whose own environment is
 * unreadable inherits the nearest ancestor's id, which covers processes that
 * clobber their argv area on macOS (see readTerminalIdsFromEnv).
 */
export class DetachedProcessResolver {
	private readonly cache = new Map<number, CacheEntry>();
	private readonly readEnv: TerminalEnvReader;

	constructor(readEnv: TerminalEnvReader = readTerminalIdsFromEnv) {
		this.readEnv = readEnv;
	}

	/**
	 * pid → terminal id for every process in `table` that is not in
	 * `excludePids` (the session trees) and resolves to one of `terminalIds`.
	 */
	async resolve({
		table,
		excludePids,
		terminalIds,
		signal,
	}: {
		table: ProcessTableEntry[];
		excludePids: Set<number>;
		terminalIds: Set<string>;
		signal?: AbortSignal;
	}): Promise<Map<number, string>> {
		const resolved = new Map<number, string>();
		if (terminalIds.size === 0) return resolved;

		const ppidByPid = new Map<number, number>();
		for (const { pid, ppid } of table) ppidByPid.set(pid, ppid);

		for (const [pid, entry] of this.cache) {
			const ppid = ppidByPid.get(pid);
			if (ppid === undefined || ppid !== entry.ppid) this.cache.delete(pid);
		}

		const uncached: number[] = [];
		for (const { pid } of table) {
			if (excludePids.has(pid) || this.cache.has(pid)) continue;
			uncached.push(pid);
		}
		if (uncached.length > 0) {
			const read = await this.readEnv(uncached, signal);
			for (const pid of uncached) {
				const ppid = ppidByPid.get(pid);
				if (ppid === undefined) continue;
				this.cache.set(pid, { ppid, terminalId: read.get(pid) ?? null });
			}
		}

		const memo = new Map<number, string | null>();
		const lookup = (startPid: number): string | null => {
			const path: number[] = [];
			let pid = startPid;
			let found: string | null = null;
			for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
				const memoized = memo.get(pid);
				if (memoized !== undefined) {
					found = memoized;
					break;
				}
				path.push(pid);
				const terminalId = this.cache.get(pid)?.terminalId ?? null;
				if (terminalId !== null) {
					found = terminalId;
					break;
				}
				const ppid = ppidByPid.get(pid);
				if (ppid === undefined || ppid <= 1 || ppid === pid) break;
				pid = ppid;
			}
			for (const visited of path) memo.set(visited, found);
			return found;
		};

		for (const { pid } of table) {
			if (excludePids.has(pid)) continue;
			const terminalId = lookup(pid);
			if (terminalId !== null && terminalIds.has(terminalId)) {
				resolved.set(pid, terminalId);
			}
		}
		return resolved;
	}
}
