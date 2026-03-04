export interface GitRawExecutor {
	raw(args: string[]): Promise<string>;
}

interface GitCommandError extends Error {
	stderr?: string;
	stdout?: string;
}

function getGitErrorText(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error);
	}

	const commandError = error as GitCommandError;
	return [error.message, commandError.stderr, commandError.stdout]
		.filter((part): part is string => Boolean(part))
		.join("\n")
		.toLowerCase();
}

function isLikelyUnbornHeadError(error: unknown): boolean {
	const text = getGitErrorText(error);
	return (
		text.includes("ambiguous argument 'head'") ||
		text.includes("bad revision 'head'") ||
		text.includes("needed a single revision") ||
		text.includes("unknown revision or path not in the working tree")
	);
}

export async function detectAndRecoverUnbornHead(
	git: GitRawExecutor,
	worktreePath: string,
	defaultBranch: string,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "HEAD"]);
		return false;
	} catch (headError) {
		if (!isLikelyUnbornHeadError(headError)) {
			console.warn(
				`[status] Failed to validate HEAD in ${worktreePath}; skipping unborn HEAD recovery`,
				headError,
			);
			return false;
		}

		try {
			console.warn(
				`[status] Detected unborn HEAD in ${worktreePath}, recovering by hard-resetting to origin/${defaultBranch}`,
			);
			await git.raw(["reset", "--hard", `origin/${defaultBranch}`]);
			return true;
		} catch (resetError) {
			console.error(
				`[status] Failed to recover unborn HEAD in ${worktreePath}:`,
				resetError,
			);
			return false;
		}
	}
}
