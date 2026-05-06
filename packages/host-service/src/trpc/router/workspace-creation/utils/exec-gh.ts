import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getStrictShellEnvironment } from "../../../../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

export interface ExecGhOptions {
	cwd?: string;
	timeout?: number;
}

/**
 * Shell out to the user's `gh` CLI. Uses the user's existing `gh auth login`,
 * which avoids credential-manager plumbing and matches V1's behavior. Returns
 * parsed JSON when stdout looks like JSON, otherwise the trimmed string.
 * Throws on non-zero exit (caller treats that as an opportunity to fall back).
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
