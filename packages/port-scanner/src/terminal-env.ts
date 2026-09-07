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
 * Above this many pids, whole-table `ps -ax` reads avoid spawning a separate
 * command/environment pair for each batch on busy machines.
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
	// A failed snapshot is not evidence that every detached server exited.
	// Let the manager preserve its last successful result and retry the scan.
	let read: Map<number, string | null>;
	try {
		read =
			platform === "linux"
				? await readEnvValuesLinuxProcfs(pids, TERMINAL_ID_ENV_KEYS, signal)
				: platform === "darwin"
					? await readTerminalIdsDarwin(pids, signal)
					: new Map<number, string | null>();
	} catch {
		// execFile errors can carry stdout containing complete environments.
		// Never let those values reach the manager's error logger.
		signal?.throwIfAborted();
		throw new Error("Process environment inspection failed");
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
		const commands = await runTolerant(
			"ps",
			["-ww", "-axo", "pid=,command="],
			options,
		);
		const output = await runTolerant(
			"ps",
			["-Eww", "-axo", "pid=,command="],
			options,
		);
		const values = new Map<number, string | null>();
		for (const [pid, value] of parsePsEnvOutput(output, commands)) {
			if (wanted.has(pid)) values.set(pid, value);
		}
		return values;
	}

	const values = new Map<number, string | null>();
	for (let i = 0; i < pids.length; i += PS_PID_BATCH) {
		const batch = pids.slice(i, i + PS_PID_BATCH);
		const commands = await runTolerant(
			"ps",
			["-ww", "-o", "pid=,command=", "-p", batch.join(",")],
			options,
		);
		const output = await runTolerant(
			"ps",
			["-Eww", "-o", "pid=,command=", "-p", batch.join(",")],
			options,
		);
		for (const [pid, value] of parsePsEnvOutput(output, commands)) {
			values.set(pid, value);
		}
	}
	return values;
}

/**
 * Strip the separately observed argv before inspecting `ps -Eww`'s appended
 * environment. Arguments can mention terminal IDs without owning a terminal.
 * If the observed argv prefix does not match, fail closed for that PID. This is a best-effort
 * attribution hint, not a security boundary: ps does not escape environment values.
 */
export function parsePsEnvOutput(
	output: string,
	commandOutput: string,
): Map<number, string | null> {
	const commands = new Map<number, string>();
	for (const line of commandOutput.split("\n")) {
		const match = line.match(/^\s*(\d+)\s+(.*)$/);
		if (match?.[1] && match[2]) commands.set(Number(match[1]), match[2]);
	}
	const values = new Map<number, string | null>();
	for (const line of output.split("\n")) {
		const match = line.match(/^\s*(\d+)\s+(.*)$/);
		if (!match) continue;
		const pidStr = match[1];
		const rest = match[2];
		if (pidStr === undefined || rest === undefined) continue;
		const pid = Number.parseInt(pidStr, 10);
		const command = commands.get(pid);
		const environment =
			command && rest.startsWith(`${command} `)
				? rest.slice(command.length + 1)
				: "";
		values.set(
			pid,
			pickEnvValue(environment.split(/\s+/), TERMINAL_ID_ENV_KEYS),
		);
	}
	return values;
}
