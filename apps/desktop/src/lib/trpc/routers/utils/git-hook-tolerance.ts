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
			`[git] ${context} but command exited non-zero (non-fatal): ${message}`,
		);
	}
}
