import type { SimpleGit } from "simple-git";

/** Whether `host` had no credential at all, or one GitHub refused. */
export type CredentialProblem = "missing" | "rejected";

export interface GitCredentialProvider {
	getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }>;

	getToken(host: string): Promise<string | null>;

	/**
	 * What the user must change when `host` has no usable credential. Only
	 * the provider knows where its tokens come from, so only it can say.
	 */
	credentialRemedy(host: string, problem: CredentialProblem): string;
}

export type GitFactory = (path: string) => Promise<SimpleGit>;
