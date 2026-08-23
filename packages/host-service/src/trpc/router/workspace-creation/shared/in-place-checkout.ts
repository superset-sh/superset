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
 * project's own clone, where the user may have edits open, so they refuse
 * rather than move a file the user did not ask them to move.
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

/** The commit a ref points at, or null when the ref does not resolve. */
async function readCommit(git: GitClient, ref: string): Promise<string | null> {
	try {
		const out = await git.raw(["rev-parse", "--verify", `${ref}^{commit}`]);
		const trimmed = out.trim();
		return /^[0-9a-f]{40,}/.test(trimmed) ? trimmed : null;
	} catch {
		return null;
	}
}

/**
 * True when the checkout writes no file: a branch this call creates, whose
 * start point is the commit the folder is already on. `git checkout -b` at
 * the same commit only writes a new ref, and edits in progress stay exactly
 * where they are, on the new branch.
 */
async function movesNoFiles(
	git: GitClient,
	plan: BranchSourcePlan,
): Promise<boolean> {
	if (plan.usedExistingBranch) return false;
	if (plan.startPoint.kind === "head") return true;
	const target = await readCommit(git, startPointArg(plan));
	const head = await readCommit(git, "HEAD");
	return target !== null && target === head;
}

/**
 * Refuse when the repo has edits to files git already tracks. A checkout
 * that changes which commit the folder holds carries those edits onto the
 * other branch, which is a surprise nobody asked for.
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
	if (!(await movesNoFiles(git, plan))) {
		await assertNoUncommittedChanges(git, repoPath, plan.branch);
	}

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

	try {
		await runWithPostCheckoutHookTolerance({
			run: async () => {
				await git.raw(checkoutArgs);
			},
			didSucceed: async () => (await readCheckedOutBranch(git)) === plan.branch,
			context: `${repoPath} checked out ${plan.branch}`,
		});
	} catch (err) {
		// Git refuses a checkout that would write over a file it does not
		// track, so a folder holding build output or a local scratch file
		// can fail here even though the two guards above passed. The folder
		// is left on the branch it started on either way.
		throw new TRPCError({
			code: "CONFLICT",
			message: `Could not check out "${plan.branch}" in ${repoPath}: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}
}
