import { execGitWithShellPath } from "./git-client";
import { createCachedResource } from "./github/cached-resource";

export type VCSProvider = "github" | "gitlab" | "unknown";

const VCS_PROVIDER_CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_VCS_PROVIDER_CACHE_ENTRIES = 256;

const vcsProviderResource = createCachedResource<VCSProvider>({
	ttlMs: VCS_PROVIDER_CACHE_TTL_MS,
	maxEntries: MAX_VCS_PROVIDER_CACHE_ENTRIES,
});

function extractHostname(remoteUrl: string): string | null {
	const trimmed = remoteUrl.trim().toLowerCase();

	// SSH: git@host:path
	const sshMatch = trimmed.match(/^git@([^:]+):/);
	if (sshMatch) {
		return sshMatch[1];
	}

	// SSH with protocol: ssh://git@host/path or ssh://git@host:port/path
	const sshProtoMatch = trimmed.match(/^ssh:\/\/git@([^/:]+)/);
	if (sshProtoMatch) {
		return sshProtoMatch[1];
	}

	// HTTPS/HTTP: https://host/path
	try {
		const url = new URL(trimmed);
		return url.hostname;
	} catch {
		return null;
	}
}

export function detectProviderFromUrl(remoteUrl: string): VCSProvider {
	const hostname = extractHostname(remoteUrl);
	if (!hostname) {
		return "unknown";
	}

	if (hostname === "github.com" || hostname.endsWith(".github.com")) {
		return "github";
	}

	if (hostname === "gitlab.com" || hostname.endsWith(".gitlab.com")) {
		return "gitlab";
	}

	return "unknown";
}

async function resolveVCSProvider(worktreePath: string): Promise<VCSProvider> {
	try {
		const { stdout } = await execGitWithShellPath(
			["remote", "get-url", "origin"],
			{ cwd: worktreePath },
		);
		const remoteUrl = stdout.trim();
		if (!remoteUrl) {
			return "unknown";
		}

		const provider = detectProviderFromUrl(remoteUrl);
		if (provider !== "unknown") {
			return provider;
		}

		// For self-hosted instances, try glab to detect GitLab
		try {
			const { execWithShellEnv } = await import("./shell-env");
			await execWithShellEnv("glab", ["repo", "view", "--output", "json"], {
				cwd: worktreePath,
			});
			return "gitlab";
		} catch {
			// glab failed — not GitLab, provider is unknown
			return "unknown";
		}
	} catch {
		return "unknown";
	}
}

export async function detectVCSProvider(
	worktreePath: string,
): Promise<VCSProvider> {
	return vcsProviderResource.read(worktreePath, () =>
		resolveVCSProvider(worktreePath),
	);
}

export function clearVCSProviderCache(worktreePath: string): void {
	vcsProviderResource.invalidate(worktreePath);
}
