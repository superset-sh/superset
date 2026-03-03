interface GitRawExecutor {
	raw(args: string[]): Promise<string>;
}

export async function detectAndRecoverUnbornHead(
	git: GitRawExecutor,
	worktreePath: string,
	defaultBranch: string,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "HEAD"]);
		return false;
	} catch {
		try {
			console.warn(
				`[status] Detected unborn HEAD in ${worktreePath}, recovering by resetting to origin/${defaultBranch}`,
			);
			await git.raw(["reset", `origin/${defaultBranch}`]);
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
