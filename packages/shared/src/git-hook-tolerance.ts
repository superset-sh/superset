interface GitCommandException extends Error {
	stdout?: string;
	stderr?: string;
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
 * Runs a git checkout-ish command whose exit status can lie about the
 * outcome: post-checkout hooks run after the checkout itself, so a hook
 * that exits non-zero (or outlives the command timeout and gets killed)
 * fails the command even though the worktree/branch is fully in place.
 * `didSucceed` is the ground truth — when it confirms the operation
 * completed, the error is demoted to a warning.
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
			`[git] ${context} but the command reported failure — likely a post-checkout hook (non-fatal): ${message}`,
		);
	}
}
