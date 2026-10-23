import { PullRequestReadError } from "@superset/shared/pull-request-detail";
import { TRPCError } from "@trpc/server";
import { userError } from "../../../trpc";

/** GitHub's answer, as the error code clients branch on. */
export function githubRequestError(
	error: unknown,
	fallback: string,
): TRPCError {
	if (error instanceof TRPCError) return error;
	if (error instanceof PullRequestReadError) {
		return error.code === "NOT_FOUND"
			? userError({
					code: "NOT_FOUND",
					message: "Pull request not found",
					i18nKey: "serverError.integration.pullRequestNotFound",
				})
			: new TRPCError({ code: error.code, message: error.message });
	}

	const status =
		typeof error === "object" && error !== null && "status" in error
			? Number((error as { status: unknown }).status)
			: null;
	const message =
		error instanceof Error && error.message ? error.message : fallback;

	// GraphQL rejections arrive as errors in a 200 response — no status, but
	// still the PR's state talking (already merged, not a draft, no access).
	if (
		status === null &&
		typeof error === "object" &&
		error !== null &&
		"errors" in error
	) {
		const types = new Set(
			(Array.isArray(error.errors) ? error.errors : []).map(
				(entry: { type?: unknown }) => entry?.type,
			),
		);
		const code = types.has("NOT_FOUND")
			? "NOT_FOUND"
			: types.has("FORBIDDEN")
				? "FORBIDDEN"
				: "BAD_REQUEST";
		return new TRPCError({ code, message, cause: error });
	}

	switch (status) {
		// 405 not mergeable (conflicts/draft), 409 head branch moved on.
		case 405:
		case 409:
			return new TRPCError({ code: "CONFLICT", message, cause: error });
		case 401:
			return new TRPCError({ code: "UNAUTHORIZED", message, cause: error });
		case 403:
			return new TRPCError({ code: "FORBIDDEN", message, cause: error });
		case 404:
			return new TRPCError({ code: "NOT_FOUND", message, cause: error });
		case 422:
			return new TRPCError({ code: "BAD_REQUEST", message, cause: error });
		default:
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message,
				cause: error,
			});
	}
}
