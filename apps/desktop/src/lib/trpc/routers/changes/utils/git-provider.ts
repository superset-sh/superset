export type GitProvider = "github" | "onedev" | "unknown";

export interface OnedevConfig {
	url: string;
	accessToken: string;
}

/**
 * Detect git provider from remote URL.
 * Compares the remote hostname against known providers.
 */
export function detectGitProvider(
	remoteUrl: string,
	onedevUrl: string | null,
): GitProvider {
	const trimmed = remoteUrl.trim();

	// GitHub detection
	if (
		trimmed.includes("github.com") ||
		trimmed.includes("github.com:") ||
		trimmed.includes("github.com/")
	) {
		return "github";
	}

	// OneDev detection: compare hostname from remote against configured OneDev URL
	if (onedevUrl) {
		const onedevHostname = extractHostname(onedevUrl);
		if (onedevHostname) {
			const remoteHostname = extractRemoteHostname(trimmed);
			if (
				remoteHostname &&
				remoteHostname.toLowerCase() === onedevHostname.toLowerCase()
			) {
				return "onedev";
			}
		}
	}

	return "unknown";
}

/**
 * Extract project path from a OneDev remote URL.
 * Examples:
 *   git@onedev.rieth.io:DORAKI/DORA.KI.git → DORAKI/DORA.KI
 *   https://onedev.rieth.io/DORAKI/DORA.KI.git → DORAKI/DORA.KI
 *   https://token@onedev.rieth.io/DORAKI/DORA.KI.git → DORAKI/DORA.KI
 */
export function extractOnedevProjectPath(remoteUrl: string): string | null {
	const trimmed = remoteUrl.trim();

	// SSH format: git@host:path.git
	const sshMatch = /^git@[^:]+:(.+?)(?:\.git)?$/.exec(trimmed);
	if (sshMatch?.[1]) {
		return sshMatch[1];
	}

	// HTTPS format: https://[user@]host/path.git
	const httpsMatch =
		/^https?:\/\/(?:[^@]+@)?[^/]+\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
	if (httpsMatch?.[1]) {
		// Remove leading ~ if present (OneDev API prefix)
		return httpsMatch[1].replace(/^~\//, "");
	}

	return null;
}

function extractHostname(url: string): string | null {
	try {
		const parsed = new URL(url);
		return parsed.hostname;
	} catch {
		return null;
	}
}

function extractRemoteHostname(remoteUrl: string): string | null {
	// SSH format: git@hostname:path
	const sshMatch = /^git@([^:]+):/.exec(remoteUrl);
	if (sshMatch?.[1]) {
		return sshMatch[1];
	}

	// SSH format: ssh://git@hostname/path
	const sshUrlMatch = /^ssh:\/\/git@([^/]+)\//.exec(remoteUrl);
	if (sshUrlMatch?.[1]) {
		return sshUrlMatch[1];
	}

	// HTTPS format: https://[user@]hostname/path
	const httpsMatch = /^https?:\/\/(?:[^@]+@)?([^/:]+)/.exec(remoteUrl);
	if (httpsMatch?.[1]) {
		return httpsMatch[1];
	}

	return null;
}
