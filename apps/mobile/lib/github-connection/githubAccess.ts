import { TRPCClientError } from "@trpc/client";

export type GithubAccessFailure = "not-connected" | "no-access";

/**
 * Why the API could not act on GitHub for this person, or null when the
 * failure is something else. Not connected is fixable from the app; no
 * access is GitHub's answer about their account and is not.
 */
export function githubAccessFailure(
	error: unknown,
): GithubAccessFailure | null {
	if (!(error instanceof TRPCClientError)) return null;
	switch (error.data?.code) {
		case "PRECONDITION_FAILED":
			return "not-connected";
		case "NOT_FOUND":
		case "FORBIDDEN":
			return "no-access";
		default:
			return null;
	}
}
