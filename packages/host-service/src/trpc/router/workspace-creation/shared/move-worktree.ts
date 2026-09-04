/**
 * Renaming the worktree directory to follow its branch.
 *
 * The directory is named after the branch that existed when the workspace
 * was created, so every later branch rename drifts it. Moving it is safe
 * exactly while nothing has recorded the old path — which is why the two
 * halves here are separate: `moveWorkspaceWorktree` is the mechanic, and
 * `hasRecordedAgentHistory` is the gate late callers must consult first.
 */

import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import {
	projects,
	terminalAgentBindings,
	workspaces,
} from "../../../../db/schema";
import { invalidateLabelCache } from "../../../../ports/static-ports";
import { createGitEnvResolver } from "../../../../runtime/git";
import { claudeProjectDirName } from "../../../../terminal/harness-transcript";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import {
	type GitTaskEnv,
	gitWorktreeMoveTask,
} from "../../../../workers/tasks/git";
import { updateLocalWorkspace } from "../../../../workspaces/local-workspace-store";
import { getHostWorktreeBaseDir } from "../../settings/worktree-location";
import { discoverClaudeProfiles } from "../../usage/profiles";
import {
	isInsideProjectWorktreesRoot,
	safeResolveWorktreePath,
} from "./worktree-paths";

export type MoveWorktreeResult =
	| { moved: true; worktreePath: string }
	| { moved: false; reason: MoveWorktreeRefusal };

export type MoveWorktreeRefusal =
	/** Destination is where the worktree already lives. */
	| "unchanged"
	/** Session workspace, main checkout, or a worktree adopted from outside
	 * the managed root — not ours to relocate. */
	| "not-managed"
	/** Something already occupies the destination. `git worktree move` would
	 * move the worktree *inside* it rather than failing, so this is checked
	 * here and not left to git. */
	| "destination-exists"
	/** git refuses outright, with no --force override. */
	| "has-submodules"
	/** Needs `move -f -f`; deliberately not forced under the user. */
	| "locked"
	| "move-failed";

/**
 * Moves a workspace's worktree to `<project worktrees root>/<newLeafName>`
 * and repoints the row at it.
 *
 * Callers own the decision of *when* this is safe — see
 * `hasRecordedAgentHistory`. Every refusal is a normal outcome, not an
 * error: the branch rename that prompted the move has already succeeded and
 * a stale directory name is cosmetic, so nothing here throws.
 *
 * Refusals are silent to the user for that reason, but not to the log —
 * reporting them here rather than at each call site is what keeps the same
 * refusal from being observable through one entry point and invisible
 * through another.
 */
export async function moveWorkspaceWorktree(args: {
	ctx: HostServiceContext;
	workspaceId: string;
	newLeafName: string;
}): Promise<MoveWorktreeResult> {
	const result = await attemptMove(args);
	// `unchanged` and `not-managed` are the ordinary shape of most calls —
	// anything else means a rename the user asked for did not fully land.
	if (
		!result.moved &&
		result.reason !== "unchanged" &&
		result.reason !== "not-managed"
	) {
		console.warn("[moveWorkspaceWorktree] worktree dir kept its old name", {
			workspaceId: args.workspaceId,
			reason: result.reason,
		});
	}
	return result;
}

async function attemptMove(args: {
	ctx: HostServiceContext;
	workspaceId: string;
	newLeafName: string;
}): Promise<MoveWorktreeResult> {
	const { ctx, workspaceId, newLeafName } = args;

	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.projectId || workspace.type !== "worktree") {
		return { moved: false, reason: "not-managed" };
	}

	const project = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	if (!project?.repoPath) return { moved: false, reason: "not-managed" };

	const worktreeBaseDir =
		project.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx);
	const from = workspace.worktreePath;
	// Adopted worktrees living outside the managed root belong to whoever
	// made them; the same check keeps a corrupt row from moving the main
	// checkout.
	if (!isInsideProjectWorktreesRoot(from, project.id, worktreeBaseDir)) {
		return { moved: false, reason: "not-managed" };
	}

	let to: string;
	try {
		to = safeResolveWorktreePath(project.id, newLeafName, worktreeBaseDir);
	} catch {
		return { moved: false, reason: "move-failed" };
	}
	if (to === from) return { moved: false, reason: "unchanged" };
	if (existsSync(to)) return { moved: false, reason: "destination-exists" };

	// A branch with a slash nests the directory, and git will not create the
	// intermediate levels for us.
	try {
		mkdirSync(dirname(to), { recursive: true });
	} catch {
		return { moved: false, reason: "move-failed" };
	}

	// Env resolution stays on the event loop (it needs the credential
	// provider); the git subprocess runs in the worker pool.
	const repoPath = project.repoPath;
	let gitEnv: GitTaskEnv;
	try {
		gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
	} catch (err) {
		console.warn("[moveWorkspaceWorktree] failed to open project repo", err);
		return { moved: false, reason: "move-failed" };
	}

	const runMove = (input: { from: string; to: string }) =>
		getHostWorkerPool().run(
			gitWorktreeMoveTask,
			{ repoPath, gitEnv, ...input },
			{ timeoutMs: 60_000 },
		);

	let result: Awaited<ReturnType<typeof runMove>>;
	try {
		result = await runMove({ from, to });
	} catch (err) {
		console.warn("[moveWorkspaceWorktree] git worktree move failed", err);
		return { moved: false, reason: "move-failed" };
	}
	if (!result.moved) return { moved: false, reason: result.reason };

	const updated = updateLocalWorkspace(ctx, workspaceId, { worktreePath: to });
	if (!updated) {
		// Disk moved but the row did not; put it back rather than leave the
		// workspace pointing at a path that no longer exists.
		await runMove({ from: to, to: from }).catch((err) =>
			console.warn("[moveWorkspaceWorktree] rollback failed", {
				workspaceId,
				from,
				to,
				err,
			}),
		);
		return { moved: false, reason: "move-failed" };
	}

	invalidateLabelCache(workspaceId);
	pruneEmptyParent(dirname(from), project.id, worktreeBaseDir);
	return { moved: true, worktreePath: to };
}

/** Moving out of `<root>/feature/foo` leaves `<root>/feature` behind. */
function pruneEmptyParent(
	parent: string,
	projectId: string,
	worktreeBaseDir: string | null,
): void {
	if (!isInsideProjectWorktreesRoot(parent, projectId, worktreeBaseDir)) return;
	try {
		rmdirSync(parent);
	} catch {}
}

/**
 * Whether an agent has left anything behind that is keyed to this
 * worktree's path. Claude Code stores its transcripts under a directory
 * named after the cwd, and resume resolves a session through that name, so
 * moving the worktree after an agent has run there silently strands both.
 *
 * Live terminals are deliberately not part of this: a shell keeps working
 * across the rename (the inode follows) and only its cached `$PWD` goes
 * stale, which the next `cd` fixes.
 */
export async function hasRecordedAgentHistory(
	ctx: Pick<HostServiceContext, "db">,
	workspaceId: string,
	worktreePath: string,
): Promise<boolean> {
	const binding = ctx.db
		.select({ terminalId: terminalAgentBindings.terminalId })
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.workspaceId, workspaceId))
		.get();
	// Bindings cascade away with their terminal sessions, so a reaped
	// terminal can leave transcripts with no row to point at them.
	if (binding) return true;

	const encoded = claudeProjectDirName(worktreePath);
	for (const home of await claudeHomes()) {
		if (existsSync(join(home, "projects", encoded))) return true;
	}
	return false;
}

/**
 * Every config dir whose `projects/` could hold this path's transcripts —
 * the defaults, `CLAUDE_CONFIG_DIR` (a comma list), and the per-account
 * profiles, which keep transcripts inside the profile.
 *
 * Codex needs no equivalent: its rollouts are filed by date and session id,
 * so a moved worktree never orphans them.
 */
async function claudeHomes(): Promise<string[]> {
	const home = homedir();
	const homes = new Set([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		if (dir.trim()) homes.add(dir.trim());
	}
	try {
		for (const profile of await discoverClaudeProfiles()) {
			homes.add(profile.configDir);
		}
	} catch (err) {
		console.warn("[hasRecordedAgentHistory] profile discovery failed", err);
	}
	return [...homes];
}
