export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@github\.com:(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (!match?.groups?.owner || !match.groups.name) continue;

		return {
			provider: "github",
			owner: match.groups.owner,
			name: match.groups.name,
			url: `https://github.com/${match.groups.owner}/${match.groups.name}`,
		};
	}

	return null;
}
