import type { SimpleGit } from "simple-git";

export interface CredentialProvider {
	/** Env vars for git CLI (GIT_ASKPASS, GIT_TERMINAL_PROMPT, etc.) */
	getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }>;

	/** Raw auth token for API calls (GitHub REST API, etc.) */
	getToken(host: string): Promise<string | null>;
}

export type GitFactory = (path: string) => Promise<SimpleGit>;
