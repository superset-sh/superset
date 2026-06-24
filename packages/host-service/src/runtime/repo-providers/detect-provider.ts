import type { GitProvider } from "./types";

const cache = new Map<string, GitProvider | "unknown">();

/**
 * Probe an unknown host for GitLab.
 *
 * The GitLab REST API always exposes GET /api/v4/version:
 *   - 200  → authenticated request → GitLab is present
 *   - 401  → unauthenticated but endpoint exists → GitLab is present
 *   - anything else / network error → not GitLab (or unreachable)
 *
 * github.com and gitlab.com short-circuit without a network probe.
 * Results are cached for the lifetime of the process.
 */
export async function detectProvider(
	host: string,
): Promise<GitProvider | "unknown"> {
	if (host === "github.com") return "github";
	if (host === "gitlab.com") return "gitlab";

	const cached = cache.get(host);
	if (cached !== undefined) return cached;

	let result: GitProvider | "unknown" = "unknown";
	try {
		const res = await fetch(`https://${host}/api/v4/version`, {
			method: "GET",
		});
		if (res.status === 200 || res.status === 401) {
			result = "gitlab"; // endpoint exists → GitLab is there
		}
	} catch {
		// Network error / unknown host → stays "unknown"
	}

	cache.set(host, result);
	return result;
}

/** Test seam: reset the module-level cache. */
export function __clearProviderCache(): void {
	cache.clear();
}
