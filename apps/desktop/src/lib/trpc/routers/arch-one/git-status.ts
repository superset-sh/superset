import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

interface GitStatusResult {
	branch: string | null;
	ahead: number;
	behind: number;
	staged: number;
	modified: number;
	untracked: number;
	stashes: number;
	hasConflicts: boolean;
	lastCommitMessage: string | null;
	lastCommitDate: string | null;
}

export const createGitStatusRouter = () => {
	return router({
		getGitStatus: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }): Promise<GitStatusResult> => {
				try {
					const git = simpleGit(input.worktreePath);
					const [status, log, stashList] = await Promise.all([
						git.status(),
						git.log({ maxCount: 1 }).catch(() => null),
						git.stashList().catch(() => null),
					]);

					return {
						branch: status.current,
						ahead: status.ahead,
						behind: status.behind,
						staged: status.staged.length,
						modified: status.modified.length + status.renamed.length,
						untracked: status.not_added.length,
						stashes: stashList?.total ?? 0,
						hasConflicts: status.conflicted.length > 0,
						lastCommitMessage: log?.latest?.message ?? null,
						lastCommitDate: log?.latest?.date ?? null,
					};
				} catch {
					return {
						branch: null,
						ahead: 0,
						behind: 0,
						staged: 0,
						modified: 0,
						untracked: 0,
						stashes: 0,
						hasConflicts: false,
						lastCommitMessage: null,
						lastCommitDate: null,
					};
				}
			}),
	});
};
