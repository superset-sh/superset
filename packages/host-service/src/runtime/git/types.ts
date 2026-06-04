import type { SimpleGit } from "simple-git";

export interface GitCredentialProvider {
	getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }>;

	getToken(host: string): Promise<string | null>;
}

export type GitFactory = (path: string) => Promise<SimpleGit>;
