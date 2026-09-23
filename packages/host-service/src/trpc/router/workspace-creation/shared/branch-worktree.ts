import type { ResolvedRef } from "../../../../runtime/git/refs";
import { findWorktreeAtPath } from "./branch-search";
import { addWorktreeWithSparseCheckout } from "./sparse-checkout";
import type { GitClient } from "./types";

export interface BranchSourcePlan {
	branch: string;
	startPoint: ResolvedRef;
	usedExistingBranch: boolean;
}

// Adopt any worktree git knows about, no matter where it lives —
// tools other than Superset can also `git worktree add`, and their
// worktrees are valid adoption targets.
export function isBranchInUseByWorktreeError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err ?? "");
	const lower = message.toLowerCase();
	return (
		lower.includes("is already used by worktree") ||
		lower.includes("already checked out")
	);
}

export async function addBranchWorktree(args: {
	git: GitClient;
	plan: BranchSourcePlan;
	worktreePath: string;
	sparsePaths: string[];
}): Promise<void> {
	const { git, plan, worktreePath, sparsePaths } = args;

	// Post-checkout hooks run after the checkout itself, so a hook that exits
	// non-zero fails the operation with the worktree fully in place. Every
	// branch case below checks out `plan.branch`, so registered-at-path with
	// that branch is the ground truth. Handed to addWorktreeWithSparseCheckout
	// so it applies to whichever command actually performs the checkout —
	// the plain add below, or the sparse path's explicit `checkout` step.
	const hookTolerance = {
		context: `Worktree created at ${worktreePath}`,
		didSucceed: async () => {
			if (!(await findWorktreeAtPath(git, worktreePath, plan.branch))) {
				return false;
			}
			try {
				// The worktree list can report a branch for a half-created
				// worktree; require a resolvable HEAD in the worktree itself.
				await git.raw(["-C", worktreePath, "rev-parse", "--verify", "HEAD"]);
				return true;
			} catch {
				return false;
			}
		},
	};

	if (plan.usedExistingBranch) {
		// Existing branch — check it out into a fresh worktree. Remote-tracking
		// refs need explicit --track + -b so the worktree gets a real local
		// branch, not detached HEAD.
		await addWorktreeWithSparseCheckout({
			git,
			worktreeArgs:
				plan.startPoint.kind === "remote-tracking"
					? [
							"--track",
							"-b",
							plan.branch,
							worktreePath,
							plan.startPoint.remoteShortName,
						]
					: [
							worktreePath,
							plan.startPoint.kind === "head"
								? "HEAD"
								: plan.startPoint.shortName,
						],
			worktreePath,
			sparsePaths,
			logPrefix: "[workspaces.create]",
			hookTolerance,
		});
		return;
	}

	// New branch from start point. --no-track keeps `git pull` and
	// ahead/behind counts pointing at the branch's own upstream once
	// push.autoSetupRemote sets it on first push.
	const startPointArg =
		plan.startPoint.kind === "head"
			? "HEAD"
			: plan.startPoint.kind === "remote-tracking"
				? plan.startPoint.remoteShortName
				: plan.startPoint.shortName;
	await addWorktreeWithSparseCheckout({
		git,
		worktreeArgs: [
			"--no-track",
			"-b",
			plan.branch,
			worktreePath,
			startPointArg,
		],
		worktreePath,
		sparsePaths,
		logPrefix: "[workspaces.create]",
		hookTolerance,
	});
}
