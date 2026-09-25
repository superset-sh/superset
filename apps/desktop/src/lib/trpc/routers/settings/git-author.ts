import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getProcessEnvWithShellPath } from "../utils/shell-env";

const execFileAsync = promisify(execFile);

export async function getGitAuthorName(): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", ["config", "user.name"], {
			env: await getProcessEnvWithShellPath(),
			timeout: 10_000,
		});
		return stdout.trim() || null;
	} catch (error) {
		console.warn("[git/getGitAuthorName] Failed to read git user.name:", error);
		return null;
	}
}

let cachedGitHubUsername: { value: string | null; timestamp: number } | null =
	null;
const GITHUB_USERNAME_CACHE_TTL = 5 * 60 * 1000;

export async function getGitHubUsername(): Promise<string | null> {
	if (
		cachedGitHubUsername &&
		Date.now() - cachedGitHubUsername.timestamp < GITHUB_USERNAME_CACHE_TTL
	) {
		return cachedGitHubUsername.value;
	}
	try {
		const { stdout } = await execFileAsync(
			"gh",
			["api", "user", "--jq", ".login"],
			{ env: await getProcessEnvWithShellPath(), timeout: 10_000 },
		);
		const value = stdout.trim() || null;
		cachedGitHubUsername = { value, timestamp: Date.now() };
		return value;
	} catch (error) {
		console.warn(
			"[git/getGitHubUsername] Failed to get GitHub username:",
			error instanceof Error ? error.message : String(error),
		);
		cachedGitHubUsername = { value: null, timestamp: Date.now() };
		return null;
	}
}
