import os from "node:os";
import { EXEC_TIMEOUT_MS, runTolerant } from "./exec.ts";
import { pickEnvValue, readEnvValuesLinuxProcfs } from "./procfs.ts";

/**
 * Environment keys that carry the owning terminal's id, in priority order.
 * host-service PTYs set SUPERSET_TERMINAL_ID; the desktop's own PTY path sets
 * SUPERSET_PANE_ID with the same value it registers the session under.
 */
export const TERMINAL_ID_ENV_KEYS = [
	"SUPERSET_TERMINAL_ID",
	"SUPERSET_PANE_ID",
] as const;

/** `ps -p` takes a comma list; keep each invocation's argv comfortably short. */
const PS_PID_BATCH = 200;

/**
 * Above this many pids, one whole-table `ps -ax` is cheaper than `-p` lookups
 * (a scan on a busy machine is ~1500 pids: ~80ms for the table, ~400ms
 * via -p batches).
 */
const PS_WHOLE_TABLE_THRESHOLD = PS_PID_BATCH;

/**
 * Read the owning terminal id from each process's environment.
 *
 * Every terminal's shell is spawned with SUPERSET_TERMINAL_ID, and every
 * descendant inherits it — including servers that agents such as Claude Code
 * or Codex start in the background with a new session (setsid) and that are
 * reparented to PID 1 once their wrapper shell exits. Walking the ppid tree
 * from the shell loses those; the environment does not.
 *
 * Every requested pid is present in the result. null means the process has no
 * such variable or its environment can't be read: another user's process, or
 * on macOS a process that overwrote its argv area to set a title (Node's
 * `process.title`, zsh), which `ps -E` then can't decode. Callers propagate
 * ids from ancestors to cover the latter.
 */
export async function readTerminalIdsFromEnv(
	pids: number[],
	signal?: AbortSignal,
): Promise<Map<number, string | null>> {
	const values = new Map<number, string | null>();
	if (pids.length === 0) return values;

	const platform = os.platform();
	let read: Map<number, string | null>;
	try {
		if (platform === "linux") {
			read = await readEnvValuesLinuxProcfs(pids, TERMINAL_ID_ENV_KEYS, signal);
		} else if (platform === "darwin") {
			read = await readTerminalIdsDarwin(pids, signal);
		} else {
			read = new Map();
		}
	} catch (err) {
		if (signal?.aborted) throw err;
		read = new Map();
	}

	for (const pid of pids) values.set(pid, read.get(pid) ?? null);
	return values;
}

async function readTerminalIdsDarwin(
	pids: number[],
	signal?: AbortSignal,
): Promise<Map<number, string | null>> {
	// -E: append the environment to the command column
	// -ww: unlimited width so nothing is truncated
	// -o pid=,command=: no header
	const options = {
		maxBuffer: 64 * 1024 * 1024,
		timeout: EXEC_TIMEOUT_MS,
		signal,
	};
	if (pids.length > PS_WHOLE_TABLE_THRESHOLD) {
		const wanted = new Set(pids);
		const output = await runTolerant(
			"ps",
			["-Eww", "-axo", "pid=,command="],
			options,
		);
		const values = new Map<number, string | null>();
		for (const [pid, value] of parsePsEnvOutput(output)) {
			if (wanted.has(pid)) values.set(pid, value);
		}
		return values;
	}

	const values = new Map<number, string | null>();
	for (let i = 0; i < pids.length; i += PS_PID_BATCH) {
		const batch = pids.slice(i, i + PS_PID_BATCH);
		const output = await runTolerant(
			"ps",
			["-Eww", "-o", "pid=,command=", "-p", batch.join(",")],
			options,
		);
		for (const [pid, value] of parsePsEnvOutput(output)) {
			values.set(pid, value);
		}
	}
	return values;
}

/**
 * Parse `ps -Eww -o pid=,command=` output into pid → terminal id. The command
 * column is argv followed by `KEY=value` environment entries, all
 * space-separated; the ids are UUIDs, so scanning whitespace-split tokens for
 * the keys is unambiguous. Exported for tests.
 */
export function parsePsEnvOutput(output: string): Map<number, string | null> {
	const values = new Map<number, string | null>();
	for (const line of output.split("\n")) {
		const match = line.match(/^\s*(\d+)\s+(.*)$/);
		if (!match) continue;
		const pidStr = match[1];
		const rest = match[2];
		if (pidStr === undefined || rest === undefined) continue;
		const pid = Number.parseInt(pidStr, 10);
		values.set(pid, pickEnvValue(rest.split(/\s+/), TERMINAL_ID_ENV_KEYS));
	}
	return values;
}
