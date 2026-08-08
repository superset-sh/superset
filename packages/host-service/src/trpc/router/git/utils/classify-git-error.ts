import { TRPCError } from "@trpc/server";

// Git's own text for environmental failures: the worktree was deleted out
// from under a running git process, macOS denies reading it, or the
// directory is not a repository.
const CWD_GONE_PATTERN =
	/unable to read current working directory: no such file or directory/i;
const CWD_UNREADABLE_PATTERN = /unable to read current working directory/i;
const NOT_GIT_REPO_PATTERN = /not a git repository/i;

/**
 * Rethrows environmental git failures as typed non-500 TRPCErrors — the same
 * classification resolve-worktree.ts applies before git runs — so the Sentry
 * middleware doesn't report them as bugs. No-op for anything else; genuine
 * unexpected git failures keep reporting as 500s.
 */
export function rethrowEnvironmentalGitError(error: unknown): void {
	if (error instanceof TRPCError || !(error instanceof Error)) return;
	if (NOT_GIT_REPO_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: { kind: "NOT_GIT_REPO" },
		});
	}
	if (CWD_GONE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "WORKTREE_MISSING" },
		});
	}
	if (CWD_UNREADABLE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_ENVIRONMENT" },
		});
	}
}
