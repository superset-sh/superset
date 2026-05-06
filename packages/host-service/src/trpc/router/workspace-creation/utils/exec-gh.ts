import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getStrictShellEnvironment } from "../../../../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

/**
 * Shell out to the user's `gh` CLI. Uses the user's existing gh
 * authentication (`gh auth login`), which is simpler than octokit +
 * credential-manager plumbing and matches V1's behavior for
 * getIssueContent.
 *
 * Returns parsed JSON output if stdout is JSON (typical for `--json`
 * queries). For commands that don't return JSON (e.g., `gh pr checkout`),
 * returns the trimmed stdout string. Throws on non-zero exit.
 */
export async function execGh(
	args: string[],
	options?: { cwd?: string; timeout?: number },
): Promise<unknown> {
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
}
