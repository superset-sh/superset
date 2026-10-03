import { execFile } from "node:child_process";

const HOST_PROCESS_NAME = "superset-host";
const PS_TIMEOUT_MS = 2_000;

/**
 * Full command line for a live pid, or null when it can't be determined
 * (no `ps` on Windows, the pid is already gone, or `ps` errors). Callers
 * must treat null as "unknown" — never as a match or a mismatch.
 */
export async function inspectProcessCommand(
	pid: number,
): Promise<string | null> {
	if (process.platform === "win32") return null;
	return new Promise((resolve) => {
		execFile(
			"ps",
			["-p", String(pid), "-o", "command="],
			{ encoding: "utf8", timeout: PS_TIMEOUT_MS },
			(error, stdout) => resolve(error ? null : stdout.trim() || null),
		);
	});
}

export function looksLikeHostProcess(command: string): boolean {
	return command.includes(HOST_PROCESS_NAME);
}
