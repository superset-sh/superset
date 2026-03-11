import { createGitFactory } from "../../git/createGitFactory";
import type { CredentialProvider } from "../../git/types";
import type { ApiClient, HostServiceContext } from "../../types";

export function createContextFactory(opts: {
	credentials: CredentialProvider;
	api: ApiClient | null;
}): () => Promise<HostServiceContext> {
	return async () => ({
		git: createGitFactory(opts.credentials),
		api: opts.api,
	});
}
