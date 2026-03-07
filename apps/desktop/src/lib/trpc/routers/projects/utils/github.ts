import { execWithShellEnv } from "../../workspaces/utils/shell-env";

interface GhRepoViewResponse {
	owner?: {
		login?: string;
	};
	name?: string;
}

export interface GitHubRepoIdentity {
	owner: string;
	repoName: string;
}

/**
 * Fetches the GitHub owner and canonical repo name for a repository using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubRepoIdentity(
	repoPath: string,
): Promise<GitHubRepoIdentity | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "owner,name"],
			{ cwd: repoPath },
		);
		const parsed = JSON.parse(stdout) as GhRepoViewResponse;
		const owner = parsed.owner?.login?.trim();
		const repoName = parsed.name?.trim();
		if (!owner || !repoName) {
			return null;
		}

		return { owner, repoName };
	} catch {
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
