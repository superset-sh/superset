import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Timeout for shell commands to prevent hanging (ms) */
export const EXEC_TIMEOUT_MS = 5000;

/**
 * Run execFile and tolerate a plain non-zero exit by returning its stdout.
 * lsof exits 1 when no PIDs match the filter, and ps exits 1 when any listed
 * pid is gone — both are legitimate partial results. Aborts, timeouts, and
 * signal-kills are NOT tolerated: partial stdout from a killed child is not a
 * trustworthy snapshot, so rethrow and let the caller's outer catch turn it
 * into an empty result.
 */
export async function runTolerant(
	file: string,
	args: string[],
	options: { maxBuffer: number; timeout: number; signal?: AbortSignal },
): Promise<string> {
	try {
		const { stdout } = await execFileAsync(file, args, options);
		return stdout;
	} catch (err) {
		if (err && typeof err === "object") {
			const execErr = err as {
				stdout?: string | Buffer;
				code?: unknown;
				killed?: boolean;
				signal?: unknown;
				name?: string;
			};
			if (
				execErr.name === "AbortError" ||
				execErr.code === "ABORT_ERR" ||
				execErr.killed ||
				execErr.signal
			) {
				throw err;
			}
			if ("stdout" in execErr) {
				return String(execErr.stdout ?? "");
			}
		}
		throw err;
	}
}
