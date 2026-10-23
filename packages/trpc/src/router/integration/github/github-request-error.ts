import { PullRequestReadError } from "@superset/shared/pull-request-detail";
import { githubErrorCode } from "@superset/shared/pull-request-github";
import { TRPCError } from "@trpc/server";
import { userError } from "../../../trpc";

/** GitHub's answer, as the error code clients branch on. */
export function githubRequestError(
	error: unknown,
	fallback: string,
): TRPCError {
	if (error instanceof TRPCError) return error;
	if (error instanceof PullRequestReadError && error.code === "NOT_FOUND") {
		return userError({
			code: "NOT_FOUND",
			message: "Pull request not found",
			i18nKey: "serverError.integration.pullRequestNotFound",
		});
	}
	return new TRPCError({
		code: githubErrorCode(error),
		message: error instanceof Error && error.message ? error.message : fallback,
		cause: error,
	});
}
