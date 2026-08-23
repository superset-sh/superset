import { runWithPostCheckoutHookTolerance } from "@superset/shared/git-hook-tolerance";
import { TRPCError } from "@trpc/server";
import type { BranchSourcePlan } from "../../workspaces/workspaces";
import { listWorktreeBranches } from "./branch-search";
import type { GitClient } from "./types";
import { normalizeWorktreePath } from "./worktree-list";

/**
 * Checking out a branch in the folder the user works in themselves, instead
 * of adding a git worktree for it.
 *
 * A workspace normally gets its own directory from `git worktree add`, so a
 * checkout there cannot disturb anything. These helpers run against the
 * project's own clone, where the user may have edits open, so every one of
 * them refuses rather than moves files it did not create.
 */

/** The branch name checked out in the repo, or null when HEAD is detached. */
async function readCheckedOutBranch(git: GitClient): Promise<string | null> {
	try {
		const branch = await git.raw(["symbolic-ref", "--short", "HEAD"]);
		return branch.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Refuse when the repo has edits to files git already tracks. Such edits
 * follow the checkout onto the other branch, which is a surprise nobody
 * asked for. Files git does not track stay put during a checkout, so they
 * do not block it — build output and local scratch files are normal.
 */
async function assertNoUncommittedChanges(
	git: GitClient,
	repoPath: string,
	branch: string,
): Promise<void> {
	const status = await git.raw([
		"status",
		"--porcelain",
		"--untracked-files=no",
	]);
	if (!status.trim()) return;
	throw new TRPCError({
		code: "CONFLICT",
		message: `${repoPath} has uncommitted changes, so switching it to "${branch}" would carry them onto that branch. Commit or stash them first, or create this workspace with a worktree instead.`,
	});
}

/**
 * Refuse when another worktree already has the branch checked out. Git
 * allows one checkout of a branch at a time and would fail the command
 * anyway; this says where the other checkout is.
 */
async function assertBranchNotCheckedOutElsewhere(
	git: GitClient,
	repoPath: string,
	branch: string,
): Promise<void> {
	const { worktreeMap } = await listWorktreeBranches(git);
	const holder = worktreeMap.get(branch);
	if (!holder) return;
	if (normalizeWorktreePath(holder) === normalizeWorktreePath(repoPath)) return;
	throw new TRPCError({
		code: "CONFLICT",
		message: `Branch "${branch}" is already checked out at ${holder}. Open that workspace, or pick another branch.`,
	});
}

/** The ref `git checkout` starts a new branch from. */
function startPointArg(plan: BranchSourcePlan): string {
	if (plan.startPoint.kind === "head") return "HEAD";
	if (plan.startPoint.kind === "remote-tracking") {
		return plan.startPoint.remoteShortName;
	}
	return plan.startPoint.shortName;
}

/**
 * Check `plan.branch` out in the project's own clone, creating the branch
 * first when it does not exist yet.
 *
 * The caller must have established that the repo is on a different branch;
 * this does not compare.
 */
export async function checkoutBranchInProjectRepo(args: {
	git: GitClient;
	repoPath: string;
	plan: BranchSourcePlan;
}): Promise<void> {
	const { git, repoPath, plan } = args;

	await assertBranchNotCheckedOutElsewhere(git, repoPath, plan.branch);
	await assertNoUncommittedChanges(git, repoPath, plan.branch);

	const checkoutArgs = plan.usedExistingBranch
		? plan.startPoint.kind === "remote-tracking"
			? // A branch that only exists on the remote needs --track -b to
				// become a local branch; plain checkout would detach HEAD.
				[
					"checkout",
					"--track",
					"-b",
					plan.branch,
					plan.startPoint.remoteShortName,
				]
			: ["checkout", plan.branch]
		: // --no-track matches the worktree path: `git pull` and the
			// ahead/behind counts follow this branch's own upstream once the
			// first push sets one.
			["checkout", "--no-track", "-b", plan.branch, startPointArg(plan)];

	await runWithPostCheckoutHookTolerance({
		run: async () => {
			await git.raw(checkoutArgs);
		},
		didSucceed: async () => (await readCheckedOutBranch(git)) === plan.branch,
		context: `${repoPath} checked out ${plan.branch}`,
	});
}
