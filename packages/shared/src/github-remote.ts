export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

function buildRemote(owner: string, name: string): ParsedGitHubRemote {
	return {
		provider: "github",
		owner,
		name,
		url: `https://github.com/${owner}/${name}`,
	};
}

/**
 * Parse a git remote URL into its GitHub owner/repo. Returns null for any
 * non-GitHub host so callers can treat the repo as local-only.
 *
 * Accepts every remote form git itself does for github.com, not just the
 * canonical clone URLs: scp-like (`git@github.com:owner/repo`), any scheme
 * (`https`, `http`, `ssh`, `git`, `git+ssh`), an embedded `user[:token]@`
 * (HTTPS clones and credential-helper rewrites bake one in), and an explicit
 * `:port`. Regressions here surface as "No git remote detected" in the v2 UI
 * even when `git remote` shows a valid remote (#5865).
 */
export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const trimmed = remoteUrl.trim();
	if (!trimmed) return null;

	const patterns = [
		// scp-like syntax (no scheme): [user@]github.com:owner/repo[.git]
		/^(?:[^@/]+@)?github\.com:(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i,
		// Any scheme (https, http, ssh, git, git+ssh, ...) with optional
		// user[:token]@ userinfo and optional :port:
		//   scheme://[user@]github.com[:port]/owner/repo[.git]
		/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (match?.groups?.owner && match.groups.name) {
			return buildRemote(match.groups.owner, match.groups.name);
		}
	}

	return null;
}
