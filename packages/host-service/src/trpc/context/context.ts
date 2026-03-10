import { createGitFactory } from "../../git/createGitFactory";
import type { CredentialProvider, HostServiceContext } from "../../git/types";

export function createContextFactory(
	provider: CredentialProvider,
): () => Promise<HostServiceContext> {
	return async () => ({
		git: createGitFactory(provider),
	});
}
