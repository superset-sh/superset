import simpleGit from "simple-git";

import type { GitCredentialProvider, GitFactory } from "./types";
import { getRemoteUrl } from "./utils";

export function createGitFactory(provider: GitCredentialProvider): GitFactory {
	return async (repoPath: string) => {
		const initialCredentials = await provider.getCredentials(null);
		const git = simpleGit(repoPath).env(initialCredentials.env);
		const remoteUrl = await getRemoteUrl(git);
		const credentials = await provider.getCredentials(remoteUrl);

		return git.env({
			...initialCredentials.env,
			...credentials.env,
		});
	};
}
