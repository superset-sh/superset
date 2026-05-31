interface GitCommandException extends Error {
	stdout?: string;
	stderr?: string;
	// node:child_process exec errors carry the child's exit code (number) or a
	// spawn-error string like "ENOENT", and `signal` when killed by a signal.
	code?: number | string;
	signal?: string;
}

function getErrorText(error: unknown): string {
	if (error instanceof Error) {
		const parts = [error.message];
		const gitError = error as GitCommandException;
		if (typeof gitError.stderr === "string" && gitError.stderr.trim()) {
			parts.push(gitError.stderr);
		}
		if (typeof gitError.stdout === "string" && gitError.stdout.trim()) {
			parts.push(gitError.stdout);
		}
		return parts.join("\n");
	}

	return String(error);
}

/**
 * Recognises a failure that comes from the post-checkout hook itself. Husky and
 * similar managers print identifiable diagnostics, so we can match on them.
 */
function isPostCheckoutHookFailure(error: unknown): boolean {
	const text = getErrorText(error).toLowerCase();
	if (!text.includes("post-checkout")) {
		return false;
	}

	return (
		text.includes("hook") ||
		text.includes("husky") ||
		text.includes("command not found")
	);
}

// SIGPIPE (signal 13) → exit 141 (128 + 13).
const SIGPIPE_EXIT_CODE = 141;

/**
 * Recognises a process that died from SIGPIPE. A post-checkout hook pipeline
 * that hits SIGPIPE under `set -o pipefail` (e.g. `git worktree list | awk
 * '…exit'`) propagates exit 141 with no diagnostic text, so the keyword check
 * above can't see it (#4350).
 *
 * We match SIGPIPE specifically rather than any `code > 128`: git's own usage
 * errors exit 129 (= 128 + SIGHUP numerically, but really a usage failure) and
 * user interrupts exit 130 (SIGINT) / 143 (SIGTERM) — none of which we want to
 * silently tolerate. Genuine git failures ("fatal: …") exit 128 or 1.
 */
function isSigPipeFailure(error: unknown): boolean {
	const { code, signal } = error as GitCommandException;
	return signal === "SIGPIPE" || code === SIGPIPE_EXIT_CODE;
}

/**
 * Runs a git command whose checkout step may fire hooks (e.g. `post-checkout`),
 * tolerating a non-zero exit when — and only when — the failure plausibly came
 * from that hook step AND the intended end-state was actually reached.
 *
 * `git worktree add` and branch checkout run the repo's `post-checkout` hook
 * AFTER the worktree is created and the branch is checked out. A flaky hook can
 * exit non-zero — sometimes with no identifying diagnostic output at all, e.g. a
 * pipeline that dies with SIGPIPE / exit 141 (`git worktree list | awk '…exit'`
 * under `set -o pipefail`) — even though git already finished its work.
 *
 * We forgive the failure only if it looks like a hook failure (recognisable
 * diagnostics) or a SIGPIPE-terminated process (exit 141), and the concrete
 * outcome we wanted is real (`didSucceed`: worktree registered / branch
 * switched). Genuine git usage errors ("fatal: …", exit 128/129/1) are NEVER
 * swallowed — even if `didSucceed` would pass over a stale/pre-existing worktree
 * at the same path — so a real `worktree add` failure is not hidden.
 */
export async function runWithPostCheckoutHookTolerance({
	run,
	didSucceed,
	context,
}: {
	run: () => Promise<void>;
	didSucceed: () => Promise<boolean>;
	context: string;
}): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (!isPostCheckoutHookFailure(error) && !isSigPipeFailure(error)) {
			throw error;
		}

		let succeeded = false;
		try {
			succeeded = await didSucceed();
		} catch {
			succeeded = false;
		}

		if (!succeeded) {
			throw error;
		}

		const message = getErrorText(error);
		console.warn(
			`[git] ${context} but the post-checkout step exited non-zero (non-fatal): ${message}`,
		);
	}
}
