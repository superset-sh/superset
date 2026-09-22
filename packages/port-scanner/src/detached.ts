import type { ProcessTableEntry } from "./scanner.ts";
import { readTerminalIdsFromEnv } from "./terminal-env.ts";

export type TerminalEnvReader = (
	pids: number[],
	signal?: AbortSignal,
) => Promise<Map<number, string | null>>;

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
 * Environment is read afresh each scan. PID and PPID alone cannot identify a
 * process instance: a PID may be reused with the same parent between scans.
 * Without a stable instance identifier, caching could assign an unrelated
 * listener to a terminal and expose it for termination. A pid whose environment is
 * unreadable inherits the nearest ancestor's id, which covers processes that
 * clobber their argv area on macOS (see readTerminalIdsFromEnv).
 */
export class DetachedProcessResolver {
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

		const candidates = table
			.filter(({ pid }) => !excludePids.has(pid))
			.map(({ pid }) => pid);
		const terminalIdByPid =
			candidates.length > 0
				? await this.readEnv(candidates, signal)
				: new Map<number, string | null>();

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
				const terminalId = terminalIdByPid.get(pid) ?? null;
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
