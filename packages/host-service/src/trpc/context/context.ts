import { Octokit } from "@octokit/rest";
import type { HostDb } from "../../db";
import { createGitFactory } from "../../git/createGitFactory";
import type { CredentialProvider } from "../../git/types";
import type { ApiClient, HostServiceContext } from "../../types";

export function createContextFactory(opts: {
	credentials: CredentialProvider;
	api: ApiClient | null;
	db: HostDb;
}): () => Promise<HostServiceContext> {
	return async () => ({
		git: createGitFactory(opts.credentials),
		github: async () => {
			const token = await opts.credentials.getToken("github.com");
			if (!token) {
				throw new Error(
					"No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or authenticate via git credential manager.",
				);
			}
			return new Octokit({ auth: token });
		},
		api: opts.api,
		db: opts.db,
	});
}
