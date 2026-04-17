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
 * Returns parsed JSON output. Throws on non-zero exit or JSON parse
 * failure.
 */
export async function execGh(args: string[]): Promise<unknown> {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	const { stdout } = await execFileAsync("gh", args, {
		encoding: "utf8",
		timeout: 10_000,
		env,
	});
	const trimmed = stdout.trim();
	if (!trimmed) return {};
	return JSON.parse(trimmed);
}
