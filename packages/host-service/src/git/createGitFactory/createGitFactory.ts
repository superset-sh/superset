import simpleGit from "simple-git";
import type { CredentialProvider, GitFactory } from "../types";
import { getRemoteUrl } from "./utils/utils";

export function createGitFactory(provider: CredentialProvider): GitFactory {
	return async (repoPath: string) => {
		const git = simpleGit(repoPath);
		const remoteUrl = await getRemoteUrl(git);
		const creds = await provider.getCredentials(remoteUrl);
		return git.env(creds.env);
	};
}
