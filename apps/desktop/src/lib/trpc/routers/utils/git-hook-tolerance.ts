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

export function isPostCheckoutHookFailure(error: unknown): boolean {
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
		if (!isPostCheckoutHookFailure(error)) {
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
			`[git] ${context} but post-checkout hook failed (non-fatal): ${message}`,
		);
	}
}
