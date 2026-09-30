import { parseRepositoryRemote } from "./source-control";

export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const parsed = parseRepositoryRemote(remoteUrl);
	if (parsed?.provider !== "github") return null;
	return {
		provider: "github",
		owner: parsed.owner,
		name: parsed.name,
		url: parsed.url,
	};
}
