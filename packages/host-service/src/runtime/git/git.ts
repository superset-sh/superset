import { createUserSimpleGit } from "./simple-git";
import type { GitCredentialProvider, GitFactory } from "./types";
import { getRemoteUrl } from "./utils";

// Remote-URL lookup per repo, TTL-cached: without it every env resolution
// (each ctx.git() call, each worker-task env — ~30 call sites, some in
// loops) spawns `git remote get-url origin` on the event loop. Credentials
// themselves are NOT cached here; the provider stays authoritative for
// refresh/expiry. A changed origin URL is picked up within the TTL.
const REMOTE_URL_TTL_MS = 5 * 60_000;
const remoteUrlCache = new Map<
	string,
	{ url: string | null; resolvedAt: number }
>();
// Cold-miss coalescing: a boot burst of status polls would otherwise spawn
// one `git remote get-url` per concurrent caller before the first caches.
const remoteUrlInFlight = new Map<string, Promise<string | null>>();

function getRemoteUrlCached(
	repoPath: string,
	env: Record<string, string>,
): Promise<string | null> {
	const cached = remoteUrlCache.get(repoPath);
	if (cached && Date.now() - cached.resolvedAt < REMOTE_URL_TTL_MS) {
		return Promise.resolve(cached.url);
	}
	const inFlight = remoteUrlInFlight.get(repoPath);
	if (inFlight) return inFlight;

	const resolving = getRemoteUrl(createUserSimpleGit(repoPath).env(env))
		.then((url) => {
			remoteUrlCache.set(repoPath, { url, resolvedAt: Date.now() });
			return url;
		})
		.finally(() => {
			remoteUrlInFlight.delete(repoPath);
		});
	remoteUrlInFlight.set(repoPath, resolving);
	return resolving;
}

/**
 * Resolve the env a git invocation for `repoPath` needs (credentials for the
 * repo's remote + lock hygiene). Split out from the factory so worker tasks
 * can receive the env as plain data and build their own SimpleGit off-thread.
 */
export function createGitEnvResolver(provider: GitCredentialProvider) {
	return async (repoPath: string): Promise<Record<string, string>> => {
		const initialCredentials = await provider.getCredentials(null);
		const remoteUrl = await getRemoteUrlCached(
			repoPath,
			initialCredentials.env,
		);
		const credentials = await provider.getCredentials(remoteUrl);

		return {
			...initialCredentials.env,
			...credentials.env,
			GIT_OPTIONAL_LOCKS: "0",
		};
	};
}

export function createGitFactory(provider: GitCredentialProvider): GitFactory {
	const resolveEnv = createGitEnvResolver(provider);
	return async (repoPath: string) =>
		createUserSimpleGit(repoPath).env(await resolveEnv(repoPath));
}
