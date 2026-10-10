import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getToolEnvironment } from "../../../../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

export interface ExecGhOptions {
	cwd?: string;
	timeout?: number;
	/** Override the 10MB stdout cap for known-large payloads (PR diffs). */
	maxBuffer?: number;
	/** Written to stdin, for bodies too long for one argv element. */
	input?: string;
}

/**
 * Shell to `gh`. Relies on the user's existing `gh auth login` rather than
 * the git credential manager, matching V1. Returns parsed JSON when stdout
 * is JSON, else the trimmed string. Throws on non-zero exit so callers can
 * fall back.
 */
export type ExecGh = (
	args: string[],
	options?: ExecGhOptions,
) => Promise<unknown>;

export const execGh: ExecGh = async (args, options) => {
	const env = await getToolEnvironment();
	const child = execFileAsync("gh", args, {
		encoding: "utf8",
		timeout: options?.timeout ?? 10_000,
		// Node's 1MB default dies on large REST payloads (open-PR sweeps of
		// busy repos exceed it even paginated).
		maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
		cwd: options?.cwd,
		env,
	});
	if (options?.input !== undefined) child.child.stdin?.end(options.input);
	const { stdout } = await child;
	const trimmed = stdout.trim();
	if (!trimmed) return {};
	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
};
