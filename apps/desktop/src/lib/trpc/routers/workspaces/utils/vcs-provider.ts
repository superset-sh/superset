import { execGitWithShellPath } from "./git-client";
import { createCachedResource } from "./github/cached-resource";

export type VCSProvider = "github" | "gitlab" | "unknown";

const VCS_PROVIDER_CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_VCS_PROVIDER_CACHE_ENTRIES = 256;

const vcsProviderResource = createCachedResource<VCSProvider>({
	ttlMs: VCS_PROVIDER_CACHE_TTL_MS,
	maxEntries: MAX_VCS_PROVIDER_CACHE_ENTRIES,
});

export function detectProviderFromUrl(remoteUrl: string): VCSProvider {
	const lower = remoteUrl.toLowerCase();

	if (
		lower.includes("github.com") ||
		lower.includes("github.com:") ||
		lower.includes("github.com/")
	) {
		return "github";
	}

	if (
		lower.includes("gitlab.com") ||
		lower.includes("gitlab.com:") ||
		lower.includes("gitlab.com/")
	) {
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
			// glab failed — not GitLab, fall back to GitHub (backwards compat)
			return "github";
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
