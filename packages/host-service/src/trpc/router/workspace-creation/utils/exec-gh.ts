import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getStrictShellEnvironment } from "../../../../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

export interface ExecGhOptions {
	cwd?: string;
	timeout?: number;
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
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	const { stdout } = await execFileAsync("gh", args, {
		encoding: "utf8",
		timeout: options?.timeout ?? 10_000,
		cwd: options?.cwd,
		env,
	});
	const trimmed = stdout.trim();
	if (!trimmed) return {};
	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
};
