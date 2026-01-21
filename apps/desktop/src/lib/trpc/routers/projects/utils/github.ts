import { z } from "zod";
import { execWithShellEnv } from "../../workspaces/utils/shell-env";

const GHRepoOwnerResponseSchema = z.object({
	owner: z.object({
		login: z.string(),
	}),
});

const GHRepoInfoResponseSchema = z.object({
	owner: z.object({
		login: z.string(),
	}),
	name: z.string(),
});

export interface RepoInfo {
	owner: string;
	name: string;
}

/**
 * Fetches the GitHub repo owner and name using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubRepoInfo(
	repoPath: string,
): Promise<RepoInfo | null> {
	try {
		const { stdout, stderr } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "owner,name"],
			{ cwd: repoPath },
		);
		if (stderr) {
			console.log("[fetchGitHubRepoInfo] stderr:", stderr);
		}
		const raw = JSON.parse(stdout);
		const result = GHRepoInfoResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Repo info schema validation failed:", result.error);
			return null;
		}
		return {
			owner: result.data.owner.login,
			name: result.data.name,
		};
	} catch (error) {
		console.error("[fetchGitHubRepoInfo] Error:", error);
		return null;
	}
}

/**
 * Fetches the GitHub owner (user or org) for a repository using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubOwner(
	repoPath: string,
): Promise<string | null> {
	try {
		console.log("[fetchGitHubOwner] Running gh repo view in:", repoPath);
		const { stdout, stderr } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "owner"],
			{ cwd: repoPath },
		);
		if (stderr) {
			console.log("[fetchGitHubOwner] stderr:", stderr);
		}
		console.log("[fetchGitHubOwner] stdout:", stdout);
		const raw = JSON.parse(stdout);
		const result = GHRepoOwnerResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Owner schema validation failed:", result.error);
			return null;
		}
		console.log("[fetchGitHubOwner] Parsed owner:", result.data.owner.login);
		return result.data.owner.login;
	} catch (error) {
		console.error("[fetchGitHubOwner] Error:", error);
		return null;
	}
}

/**
 * Constructs the GitHub avatar URL for a user or organization.
 * GitHub serves avatars at https://github.com/{owner}.png
 */
export function getGitHubAvatarUrl(owner: string): string {
	return `https://github.com/${owner}.png`;
}
