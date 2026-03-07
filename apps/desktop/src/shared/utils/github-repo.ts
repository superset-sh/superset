const GITHUB_PR_HOSTS = new Set(["github.com", "www.github.com"]);

export interface GitHubRepoRef {
	owner: string;
	repoName: string;
	fullName: string;
	repoUrl: string;
}

export interface ParsedGitHubPrUrl {
	owner: string;
	repo: string;
	number: number;
}

export function getRepoNameFromPath(
	mainRepoPath: string | null,
): string | null {
	if (!mainRepoPath) {
		return null;
	}

	const normalizedPath = mainRepoPath.replace(/[\\/]+$/, "");
	if (!normalizedPath) {
		return null;
	}

	const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
	return segments.at(-1) ?? null;
}

export function getGitHubRepoRef(input: {
	githubOwner: string | null;
	githubRepoName?: string | null;
	mainRepoPath: string | null;
}): GitHubRepoRef | null {
	const repoName =
		input.githubRepoName ?? getRepoNameFromPath(input.mainRepoPath);
	if (!input.githubOwner || !repoName) {
		return null;
	}

	return {
		owner: input.githubOwner,
		repoName,
		fullName: `${input.githubOwner}/${repoName}`,
		repoUrl: `https://github.com/${input.githubOwner}/${repoName}`,
	};
}

export function parseGitHubPrUrl(url: string): ParsedGitHubPrUrl | null {
	let normalizedUrl = url.trim();
	if (!normalizedUrl) {
		return null;
	}

	if (
		!normalizedUrl.startsWith("http://") &&
		!normalizedUrl.startsWith("https://")
	) {
		normalizedUrl = `https://${normalizedUrl}`;
	}

	try {
		const urlObj = new URL(normalizedUrl);
		if (!GITHUB_PR_HOSTS.has(urlObj.hostname.toLowerCase())) {
			return null;
		}

		const match = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
		if (!match) {
			return null;
		}

		return {
			owner: match[1],
			repo: match[2],
			number: Number.parseInt(match[3], 10),
		};
	} catch {
		return null;
	}
}

export function toCanonicalGitHubPrUrl(
	parsed: ParsedGitHubPrUrl | null,
): string | null {
	if (!parsed) {
		return null;
	}

	return `https://github.com/${parsed.owner}/${parsed.repo}/pull/${parsed.number}`;
}
