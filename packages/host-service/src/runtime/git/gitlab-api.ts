import type { GitLabRestDeps } from "../repo-providers/gitlab/gitlab-rest";
import type { GitCredentialProvider } from "./types";

export function gitLabApiDeps(
	credentials: GitCredentialProvider,
	repo: { host: string; owner: string; name: string },
): GitLabRestDeps {
	return {
		host: repo.host,
		token: () => credentials.getToken(repo.host),
		request: credentials.getGitLabRequest?.(repo),
	};
}
