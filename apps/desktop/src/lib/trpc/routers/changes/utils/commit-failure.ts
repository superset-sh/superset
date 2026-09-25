import { TRPCError } from "@trpc/server";
import { rethrowEnvironmentalGitError } from "../../workspaces/utils/git-errors";

// git exits 1 when it declines to create the commit — a pre-commit or
// commit-msg hook rejected it, the message was empty. That lives in the user's
// repo, not in our code. Git's own hard failures die() with 128, and usage
// errors exit 129, so the exit status separates the two without reading the
// text a hook wrote: that text is arbitrary user program output and matching
// it would classify on the hook author's prose.
const GIT_COMMIT_DECLINED_EXIT_CODE = 1;

// A commit failure message is whatever the user's hooks printed: task-runner
// logs, linter and test output, absolute paths, fixture rows. Reported errors
// must therefore carry our own framing plus a short leading excerpt only, and
// never the whole stream.
const CAPTURED_EXCERPT_LIMIT = 200;

/**
 * Replaces a git failure with one safe to capture: bounded length, no line
 * breaks (so no stack frames can be parsed back out of the child's output).
 */
export function toBoundedCommitFailure(error: unknown): Error {
	const raw = error instanceof Error ? error.message : String(error);
	const collapsed = raw.replace(/\s+/g, " ").trim();
	const excerpt = collapsed.slice(0, CAPTURED_EXCERPT_LIMIT);
	const truncated = collapsed.length > CAPTURED_EXCERPT_LIMIT;
	return new Error(
		truncated
			? `git commit failed: ${excerpt} (truncated, ${collapsed.length} chars)`
			: `git commit failed: ${excerpt}`,
	);
}

/**
 * Boundary catch for the commit procedure. `exitCode` is git's own status for
 * the failed command; a declined commit becomes a typed non-500 keeping git's
 * full output for the user, and anything still worth reporting is bounded
 * first so a capture can never carry the child process's stream content.
 */
export function rethrowCommitFailure(
	error: unknown,
	exitCode: number | undefined,
): never {
	if (error instanceof TRPCError) {
		throw error;
	}
	// Before wrapping: a deleted worktree or a non-repo has its own kinds that
	// consumers branch on, and the outer boundary skips TRPCErrors.
	rethrowEnvironmentalGitError(error);
	if (exitCode === GIT_COMMIT_DECLINED_EXIT_CODE) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error instanceof Error ? error.message : String(error),
			cause: { kind: "COMMIT_DECLINED" },
		});
	}
	throw toBoundedCommitFailure(error);
}
