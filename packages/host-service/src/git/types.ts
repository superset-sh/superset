import type { SimpleGit } from "simple-git";

export interface CredentialProvider {
	getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }>;
}

export type GitFactory = (path: string) => Promise<SimpleGit>;

export interface HostServiceContext {
	git: GitFactory;
}
