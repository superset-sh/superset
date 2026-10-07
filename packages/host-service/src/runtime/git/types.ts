import type { SimpleGit, SimpleGitOptions } from "simple-git";

/** Whether `host` had no credential at all, or one GitHub refused. */
export type CredentialProblem = "missing" | "rejected";

export type GitLabApiRequest = (
	path: string,
	init: RequestInit,
) => Promise<Response>;

export interface GitCredentialProvider {
	getGitLabRequest?(repo: {
		host: string;
		owner: string;
		name: string;
	}): GitLabApiRequest | undefined;
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

export type GitFactory = (
	path: string,
	options?: Pick<SimpleGitOptions, "timeout">,
) => Promise<SimpleGit>;
