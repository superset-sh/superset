export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

export interface ParsedGitLabRemote {
	provider: "gitlab";
	host: string;
	owner: string;
	name: string;
	url: string;
}

export type ParsedRepositoryRemote = ParsedGitHubRemote | ParsedGitLabRemote;

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

const GITLAB_COM_HOSTS = new Set(["gitlab.com"]);

export function parseGitLabRemoteCandidate(
	remoteUrl: string,
): ParsedGitLabRemote | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@(?<host>[^/:]+):(?<path>.+?)(?:\.git)?$/,
		/^ssh:\/\/git@(?<host>[^/:]+(?::\d+)?)\/(?<path>.+?)(?:\.git)?$/,
		/^https:\/\/(?<host>[^/]+)\/(?<path>.+?)(?:\.git)?\/?$/,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		const host = match?.groups?.host;
		const path = match?.groups?.path?.replace(/\/$/, "");
		if (!host || !path) continue;

		const segments = path.split("/").filter(Boolean);
		const name = segments.pop();
		const owner = segments.join("/");
		if (!name || !owner) continue;

		return {
			provider: "gitlab",
			host: host.toLowerCase(),
			owner,
			name,
			url: `https://${host}/${owner}/${name}`,
		};
	}

	return null;
}

export function parseGitLabRemote(
	remoteUrl: string,
	knownHosts: ReadonlySet<string> = GITLAB_COM_HOSTS,
): ParsedGitLabRemote | null {
	const parsed = parseGitLabRemoteCandidate(remoteUrl);
	return parsed && knownHosts.has(parsed.host) ? parsed : null;
}

export function parseRepositoryRemote(
	remoteUrl: string,
	knownGitLabHosts?: ReadonlySet<string>,
): ParsedRepositoryRemote | null {
	return (
		parseGitHubRemote(remoteUrl) ??
		parseGitLabRemote(remoteUrl, knownGitLabHosts)
	);
}
