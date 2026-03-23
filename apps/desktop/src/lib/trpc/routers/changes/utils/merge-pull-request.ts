import { execGitWithShellPath } from "../../workspaces/utils/git-client";
import {
	getPRForBranch,
	getPullRequestRepoArgs,
	getRepoContext,
} from "../../workspaces/utils/github";
import { execWithShellEnv } from "../../workspaces/utils/shell-env";
import { isNoPullRequestFoundMessage } from "../git-utils";
import { clearWorktreeStatusCaches } from "./worktree-status-caches";

const PR_ALREADY_MERGED_MESSAGE = "PR is already merged";
const PR_CLOSED_MESSAGE = "PR is closed and cannot be merged";

export interface MergePullRequestInput {
	worktreePath: string;
	strategy: "merge" | "squash" | "rebase";
}

export async function mergePullRequest({
	worktreePath,
	strategy,
}: MergePullRequestInput): Promise<{ success: boolean; mergedAt: string }> {
	const legacyMergeArgs = ["pr", "merge", `--${strategy}`];
	const runMerge = async (
		args: string[],
	): Promise<{ success: boolean; mergedAt: string }> => {
		await execWithShellEnv("gh", args, { cwd: worktreePath });
		clearWorktreeStatusCaches(worktreePath);
		return { success: true, mergedAt: new Date().toISOString() };
	};

	const repoContext = await getRepoContext(worktreePath);
	if (!repoContext) {
		return runMerge(legacyMergeArgs);
	}

	let pr: Awaited<ReturnType<typeof getPRForBranch>> = null;
	try {
		const [{ stdout: branchOutput }, { stdout: headOutput }] =
			await Promise.all([
				execGitWithShellPath(["rev-parse", "--abbrev-ref", "HEAD"], {
					cwd: worktreePath,
				}),
				execGitWithShellPath(["rev-parse", "HEAD"], { cwd: worktreePath }),
			]);
		const localBranch = branchOutput.trim();
		const headSha = headOutput.trim();

		pr = await getPRForBranch(worktreePath, localBranch, repoContext, headSha);
	} catch (error) {
		console.warn(
			"[git/mergePR] Explicit PR resolution failed; falling back to branch merge.",
			{
				worktreePath,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return runMerge(legacyMergeArgs);
	}

	if (!pr) {
		return runMerge(legacyMergeArgs);
	}
	if (pr.state === "merged") {
		throw new Error(PR_ALREADY_MERGED_MESSAGE);
	}
	if (pr.state === "closed") {
		throw new Error(PR_CLOSED_MESSAGE);
	}

	const args = [
		"pr",
		"merge",
		String(pr.number),
		`--${strategy}`,
		...getPullRequestRepoArgs(repoContext),
	];

	try {
		return await runMerge(args);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isNoPullRequestFoundMessage(message)) {
			return runMerge(legacyMergeArgs);
		}
		throw error;
	}
}
