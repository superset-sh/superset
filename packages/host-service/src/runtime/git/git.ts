import { createUserSimpleGit } from "./simple-git";
import type { GitCredentialProvider, GitFactory } from "./types";
import { getRemoteUrl } from "./utils";

/**
 * Resolve the env a git invocation for `repoPath` needs (credentials for the
 * repo's remote + lock hygiene). Split out from the factory so worker tasks
 * can receive the env as plain data and build their own SimpleGit off-thread.
 */
export function createGitEnvResolver(provider: GitCredentialProvider) {
	return async (repoPath: string): Promise<Record<string, string>> => {
		const initialCredentials = await provider.getCredentials(null);
		const git = createUserSimpleGit(repoPath).env(initialCredentials.env);
		const remoteUrl = await getRemoteUrl(git);
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
