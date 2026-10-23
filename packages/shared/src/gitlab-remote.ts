import type { ParsedGitHubRemote } from "./github-remote";

export interface ParsedGitLabRemote
	extends Omit<ParsedGitHubRemote, "provider"> {
	provider: "gitlab";
}

/**
 * Any host: the caller asks glab whether it knows it.
 * The owner carries the host (`host/group`): MRs of two instances never share
 * an identity, and no GitHub owner (no slash allowed) can match one.
 */
export function parseGitLabRemote(
	remoteUrl: string,
): ParsedGitLabRemote | null {
	const match =
		/^(?<scheme>git@|ssh:\/\/git@|https:\/\/)(?<host>[^/:]+)(?<port>:\d+)?[:/](?<owner>.+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i.exec(
			remoteUrl.trim(),
		);
	const { scheme, host, port, owner, name } = match?.groups ?? {};
	if (!host || !owner || !name) return null;
	const origin = scheme === "https://" ? `${host}${port ?? ""}` : host;
	return {
		provider: "gitlab",
		owner: `${origin}/${owner}`,
		name,
		url: `https://${origin}/${owner}/${name}`,
	};
}
