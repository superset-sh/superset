import { TRPCError } from "@trpc/server";

// Git's own text for environmental failures: the worktree was deleted out
// from under a running git process, macOS denies reading it, or the
// directory is not a repository.
const CWD_GONE_PATTERN =
	/unable to read current working directory: no such file or directory/i;
const CWD_UNREADABLE_PATTERN = /unable to read current working directory/i;
const NOT_GIT_REPO_PATTERN = /not a git repository/i;
// Git's text when the directory resolves to a repository but has no work tree
// attached: the repo is bare, or the linked worktree's admin data was removed
// or pruned. Distinct from CWD_GONE_PATTERN, where the directory itself is
// unlinked from under the running process.
const NOT_A_WORK_TREE_PATTERN = /this operation must be run in a work tree/i;
// simple-git's own text, thrown from its factory before any git process is
// spawned, when baseDir is gone. Same condition as CWD_GONE_PATTERN, caught one
// step earlier. Matched on the sentence rather than the error type: simple-git's
// GitError never assigns `this.name`, so a GitConstructError arrives named
// "Error", and the worker boundary keeps only name/message/stack. The sentence
// is also the narrower matcher — GitConstructError covers our own construction
// mistakes too, and those must keep reporting as 500s.
const SIMPLE_GIT_BASE_DIR_MISSING_PATTERN =
	/cannot use simple-git on a directory that does not exist/i;

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
	if (NOT_A_WORK_TREE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "NOT_A_WORK_TREE" },
		});
	}
	if (CWD_GONE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "WORKTREE_MISSING" },
		});
	}
	if (SIMPLE_GIT_BASE_DIR_MISSING_PATTERN.test(error.message)) {
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
