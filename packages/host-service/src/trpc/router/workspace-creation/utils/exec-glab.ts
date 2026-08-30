import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getStrictShellEnvironment } from "../../../../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

export interface ExecGlabOptions {
	cwd?: string;
	timeout?: number;
	maxBuffer?: number;
}

export type ExecGlab = (
	args: string[],
	options?: ExecGlabOptions,
) => Promise<unknown>;

/**
 * Shell to `glab` in the repository so it selects the authenticated GitLab
 * host from that repository's remotes (including self-managed instances).
 */
export const execGlab: ExecGlab = async (args, options) => {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	const { stdout } = await execFileAsync("glab", args, {
		encoding: "utf8",
		timeout: options?.timeout ?? 10_000,
		maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
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
