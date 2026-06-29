import { parseGitRemote } from "./git-remote";

export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

/**
 * Back-compat wrapper over {@link parseGitRemote}. Returns a result only for
 * github.com remotes, preserving the original GitHub-only behavior and shape.
 */
export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const parsed = parseGitRemote(remoteUrl);
	if (!parsed || parsed.provider !== "github") return null;
	return {
		provider: "github",
		owner: parsed.owner,
		name: parsed.name,
		url: parsed.url,
	};
}
